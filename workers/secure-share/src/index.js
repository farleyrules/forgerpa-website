/**
 * Forge RPA Secure Share (forge-secure-share)
 * Zero-knowledge, one-time-view encrypted secret links.
 *
 * Design contract:
 *  - The plaintext secret is encrypted in the SENDER'S BROWSER with AES-256-GCM
 *    (Web Crypto). This Worker only ever receives ciphertext. It never sees the
 *    plaintext or the decryption key.
 *  - The 256-bit key lives ONLY in the URL fragment (after '#'), which browsers
 *    never transmit to any server. This Worker cannot reconstruct it.
 *  - Ciphertext is stored in KV under sha256(id) with a TTL. The first successful
 *    reveal deletes it (burn after read). A second reader gets 410 Gone.
 *  - Nothing sensitive is placed in a request URL: the id and key travel in the
 *    fragment (create) or a POST body (reveal), so edge request logs contain no
 *    id, key, or ciphertext. We add no logging of our own.
 *
 * See README.md for the burn-race note and the Durable Objects upgrade path.
 */

import {
  renderCreatePage,
  renderViewPage,
  CREATE_JS,
  REVEAL_JS,
  FAVICON_SVG,
} from "./pages.js";

// ---------------------------------------------------------------------------
// Config (overridable via wrangler [vars]; all arrive as strings).
// ---------------------------------------------------------------------------
const DEFAULTS = {
  DEFAULT_TTL_SECONDS: 259200, // 72h
  MIN_TTL_SECONDS: 300, // 5m
  MAX_TTL_SECONDS: 604800, // 7d
  MAX_CIPHERTEXT_BYTES: 153600, // 150 KB of base64 ciphertext
  CREATE_LIMIT: 20, // creates per window per IP
  CREATE_WINDOW: 600, // 10 minutes
  REVEAL_LIMIT: 60, // reveals per window per IP
  REVEAL_WINDOW: 60, // 1 minute
};

function cfg(env, key) {
  const raw = env && env[key];
  const n = raw == null ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) ? n : DEFAULTS[key];
}

// ---------------------------------------------------------------------------
// Response helpers + hardened headers (applied to every response).
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

// default-src 'none' with scripts locked to same-origin. Styles are inline
// (style-src 'unsafe-inline') but the only dynamic content ever written to the
// DOM (the decrypted secret) is inserted with textContent, never innerHTML, so
// a malicious "secret" cannot inject markup or script.
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

// ---------------------------------------------------------------------------
// Small crypto helpers (server side is only used for id generation + hashing
// the id into a KV key; all secret encryption happens in the browser).
// ---------------------------------------------------------------------------
function toB64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function newId() {
  // 16 random bytes -> 128 bits of entropy -> 22 base64url chars. Unguessable.
  return toB64url(crypto.getRandomValues(new Uint8Array(16)));
}

async function kvKeyForId(id) {
  // Store under sha256(id) so a KV keyspace listing never reveals the ids that
  // are actually in circulation (those live only in recipients' fragments).
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(id),
  );
  return "s:" + toB64url(new Uint8Array(digest));
}

// A single reveal only ever needs one id; keep validation strict so garbage
// never reaches KV.
function isPlausibleId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(id);
}

// ---------------------------------------------------------------------------
// Best-effort per-IP rate limiting via KV counters (fixed window).
// Fail-open: a KV hiccup must never take the tool down. This is abuse
// mitigation, not a hard quota; a Cloudflare WAF rate rule can supplement it.
// ---------------------------------------------------------------------------
async function underLimit(env, bucket, ip, limit, windowSec) {
  if (!ip) return true; // cannot identify the caller (e.g. local dev): allow
  const window = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${bucket}:${ip}:${window}`;
  try {
    const cur = parseInt((await env.SECRETS.get(key)) || "0", 10);
    if (cur >= limit) return false;
    // expirationTtl has a 60s KV minimum; clamp so short windows still store.
    await env.SECRETS.put(key, String(cur + 1), {
      expirationTtl: Math.max(60, windowSec),
    });
    return true;
  } catch {
    return true; // fail-open
  }
}

// ---------------------------------------------------------------------------
// API: create.  Body { ct, iv, ttl }. Returns { id }. Never logs or echoes ct.
// ---------------------------------------------------------------------------
async function handleCreate(request, env) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (
    !(await underLimit(
      env,
      "c",
      ip,
      cfg(env, "CREATE_LIMIT"),
      cfg(env, "CREATE_WINDOW"),
    ))
  ) {
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
  // base64 charset guard + hard size cap (defends KV from blob-stuffing abuse).
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
  const key = await kvKeyForId(id);
  await env.SECRETS.put(key, JSON.stringify({ ct, iv, v: 1 }), {
    expirationTtl: ttlSec,
  });

  return json({ id, ttl: ttlSec });
}

// ---------------------------------------------------------------------------
// API: reveal.  Body { id }. Returns { ct, iv } exactly once, then burns it.
// ---------------------------------------------------------------------------
async function handleReveal(request, env) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (
    !(await underLimit(
      env,
      "r",
      ip,
      cfg(env, "REVEAL_LIMIT"),
      cfg(env, "REVEAL_WINDOW"),
    ))
  ) {
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

  const key = await kvKeyForId(id);
  const stored = await env.SECRETS.get(key);
  if (stored == null) return json({ error: "gone" }, 410);

  // Burn. NOTE: KV has no atomic read-and-delete, so a get/delete race exists
  // (two reads landing inside KV's propagation window could both succeed). For
  // this tool the link is delivered out of band to one recipient, so the window
  // is not reachable in practice; README documents the Durable Objects upgrade
  // for hard atomic one-time semantics.
  await env.SECRETS.delete(key);

  let parsed;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return json({ error: "gone" }, 410);
  }
  return json({ ct: parsed.ct, iv: parsed.iv });
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
          return html(renderCreatePage(env));
        case "/s":
        case "/s/":
          return html(renderViewPage(env));
        case "/create.js":
          return js(CREATE_JS);
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
      if (pathname === "/api/create") return handleCreate(request, env);
      if (pathname === "/api/reveal") return handleReveal(request, env);
      return json({ error: "not_found" }, 404);
    }

    return json({ error: "method_not_allowed" }, 405);
  },
};
