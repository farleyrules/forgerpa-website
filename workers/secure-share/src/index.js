/**
 * Forge RPA Secure Share (forge-secure-share)
 * Zero-knowledge, one-time-view encrypted secret links.
 *
 * Design contract:
 *  - The plaintext secret is encrypted in the SENDER'S BROWSER with AES-256-GCM
 *    (Web Crypto). This Worker only ever receives ciphertext. It never sees the
 *    plaintext or the decryption key. An optional recipient passphrase wraps the
 *    key entirely client-side (see pages.js), so the server stays zero-knowledge
 *    whether or not a passphrase is used.
 *  - The key lives ONLY in the URL fragment (after '#'), which browsers never
 *    transmit to any server. This Worker cannot reconstruct it.
 *  - Ciphertext is stored in a per-secret Durable Object (SecretDO). The first
 *    reveal atomically returns and deletes it (burn after read). A second reader
 *    gets 410 Gone. See secret-do.js.
 *  - Creation lives under /admin/* so Cloudflare Access can gate it with one
 *    path. The recipient side (/s, /api/reveal) stays public. workers.dev is
 *    disabled so the Access gate cannot be bypassed.
 *  - Nothing sensitive is placed in a request URL: the id + key travel in the
 *    fragment (create) or a POST body (reveal), so edge request logs contain no
 *    id, key, or ciphertext. We add no logging of our own.
 */

import {
  renderCreatePage,
  renderViewPage,
  CREATE_JS,
  REVEAL_JS,
  FAVICON_SVG,
} from "./pages.js";
import { SecretDO } from "./secret-do.js";

// Re-export the Durable Object class so the runtime can bind it.
export { SecretDO };

// ---------------------------------------------------------------------------
// Config (overridable via wrangler [vars]; all arrive as strings).
// ---------------------------------------------------------------------------
const DEFAULTS = {
  DEFAULT_TTL_SECONDS: 259200, // 72h
  MIN_TTL_SECONDS: 300, // 5m
  MAX_TTL_SECONDS: 604800, // 7d
  MAX_CIPHERTEXT_BYTES: 122880, // 120 KB of base64 ct (stays under the DO 128 KiB per-value limit)
  CREATE_LIMIT: 20,
  CREATE_WINDOW: 600,
  REVEAL_LIMIT: 60,
  REVEAL_WINDOW: 60,
};

function cfg(env, key) {
  const raw = env && env[key];
  const n = raw == null ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) ? n : DEFAULTS[key];
}

// ---------------------------------------------------------------------------
// Hardened headers (applied to every response).
// ---------------------------------------------------------------------------
const BASE_HEADERS = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
  "Permissions-Policy":
    "accelerometer=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "no-store, max-age=0",
};

const CSP =
  "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'self'; font-src 'self'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CSP,
    },
  });
}

function js(body) {
  return new Response(body, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function text(body, status = 200) {
  return new Response(body, {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

function svg(body) {
  return new Response(body, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: { ...BASE_HEADERS, Location: location },
  });
}

// ---------------------------------------------------------------------------
// id + base64url helpers.
// ---------------------------------------------------------------------------
function toB64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function newId() {
  // 16 random bytes -> 128 bits -> 22 base64url chars. Unguessable.
  return toB64url(crypto.getRandomValues(new Uint8Array(16)));
}

function isPlausibleId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(id);
}

// ---------------------------------------------------------------------------
// Best-effort per-IP rate limiting via KV counters (fixed window). Fail-open.
// ---------------------------------------------------------------------------
async function underLimit(env, bucket, ip, limit, windowSec) {
  if (!ip || !env.SECRETS) return true;
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${bucket}:${ip}:${window}`;
  try {
    const cur = parseInt((await env.SECRETS.get(key)) || "0", 10);
    if (cur >= limit) return false;
    await env.SECRETS.put(key, String(cur + 1), {
      expirationTtl: Math.max(60, windowSec),
    });
    return true;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Cloudflare Access JWT verification (defense in depth). Inert until ACCESS_AUD
// is configured; when set, POST /admin/api/create requires a valid Access token
// so the origin cannot be used to create secrets outside the Access gate.
// ---------------------------------------------------------------------------
let JWKS_CACHE = { domain: null, at: 0, keys: null };

async function accessKeys(teamDomain) {
  const now = Date.now();
  if (JWKS_CACHE.keys && JWKS_CACHE.domain === teamDomain && now - JWKS_CACHE.at < 3600000) {
    return JWKS_CACHE.keys;
  }
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("jwks fetch failed");
  const body = await res.json();
  JWKS_CACHE = { domain: teamDomain, at: now, keys: body.keys || [] };
  return JWKS_CACHE.keys;
}

async function accessAuthorized(request, env) {
  if (!env.ACCESS_AUD) return true; // inert until configured
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  if (!teamDomain) return false;
  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    cookieValue(request, "CF_Authorization");
  if (!token) return false;
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return false;
    const header = JSON.parse(new TextDecoder().decode(fromB64url(h)));
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(p)));
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(env.ACCESS_AUD)) return false;
    if (payload.iss !== `https://${teamDomain}`) return false;
    if (!payload.exp || Date.now() / 1000 > payload.exp) return false;
    const jwk = (await accessKeys(teamDomain)).find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      fromB64url(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    return ok;
  } catch {
    return false;
  }
}

function cookieValue(request, name) {
  const raw = request.headers.get("Cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// ---------------------------------------------------------------------------
// API: create.  Body { ct, iv, ttl }. Returns { id, ttl }. Never logs ct.
// ---------------------------------------------------------------------------
async function handleCreate(request, env) {
  if (!(await accessAuthorized(request, env))) {
    return json({ error: "forbidden" }, 403);
  }

  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await underLimit(env, "c", ip, cfg(env, "CREATE_LIMIT"), cfg(env, "CREATE_WINDOW")))) {
    return json({ error: "rate_limited" }, 429);
  }

  const maxBytes = cfg(env, "MAX_CIPHERTEXT_BYTES");
  const declaredLen = parseInt(request.headers.get("content-length") || "0", 10);
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes + 4096) {
    return json({ error: "too_large" }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const { ct, iv, ttl } = body || {};
  if (typeof ct !== "string" || typeof iv !== "string" || !ct || !iv) {
    return json({ error: "bad_request" }, 400);
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(ct) || ct.length > maxBytes) {
    return json({ error: "too_large" }, 413);
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(iv) || iv.length > 64) {
    return json({ error: "bad_request" }, 400);
  }

  const min = cfg(env, "MIN_TTL_SECONDS");
  const max = cfg(env, "MAX_TTL_SECONDS");
  let ttlSec = parseInt(ttl, 10);
  if (!Number.isFinite(ttlSec)) ttlSec = cfg(env, "DEFAULT_TTL_SECONDS");
  ttlSec = Math.min(max, Math.max(min, ttlSec));

  const id = newId();
  const stub = env.SECRET_DO.get(env.SECRET_DO.idFromName(id));
  const res = await stub.fetch("https://do/store", {
    method: "POST",
    body: JSON.stringify({ ct, iv, ttl: ttlSec }),
  });
  if (!res.ok) return json({ error: "store_failed" }, 500);

  return json({ id, ttl: ttlSec });
}

// ---------------------------------------------------------------------------
// API: reveal.  Body { id }. Returns { ct, iv } exactly once, then burns it.
// ---------------------------------------------------------------------------
async function handleReveal(request, env) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await underLimit(env, "r", ip, cfg(env, "REVEAL_LIMIT"), cfg(env, "REVEAL_WINDOW")))) {
    return json({ error: "rate_limited" }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const id = body && body.id;
  if (!isPlausibleId(id)) return json({ error: "bad_request" }, 400);

  const stub = env.SECRET_DO.get(env.SECRET_DO.idFromName(id));
  const res = await stub.fetch("https://do/reveal", { method: "POST" });
  // The DO returns 200 { ct, iv } (and has already burned it) or 410 { gone }.
  const payload = await res.text();
  return new Response(payload, {
    status: res.status,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

// ---------------------------------------------------------------------------
// Router.
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (method === "GET" || method === "HEAD") {
      switch (pathname) {
        case "/":
          return redirect("/admin");
        case "/admin":
        case "/admin/":
          return html(renderCreatePage(env));
        case "/admin/create.js":
          return js(CREATE_JS);
        case "/s":
        case "/s/":
          return html(renderViewPage(env));
        case "/reveal.js":
          return js(REVEAL_JS);
        case "/favicon.svg":
          return svg(FAVICON_SVG);
        case "/healthz":
          return text("ok");
        case "/robots.txt":
          return text("User-agent: *\nDisallow: /\n");
        default:
          return html(renderViewPage(env, "notfound"), 404);
      }
    }

    if (method === "POST") {
      if (pathname === "/admin/api/create") return handleCreate(request, env);
      if (pathname === "/api/reveal") return handleReveal(request, env);
      return json({ error: "not_found" }, 404);
    }

    return json({ error: "method_not_allowed" }, 405);
  },
};
