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
  renderHistoryPage,
  renderRequestMintPage,
  renderSubmitPage,
  renderClaimPage,
  renderRequestsPage,
  renderRequestError,
  CREATE_JS,
  REVEAL_JS,
  REQUEST_JS,
  SUBMIT_JS,
  CLAIM_JS,
  REQUESTS_JS,
  FAVICON_SVG,
} from "./pages.js";
import { SecretDO } from "./secret-do.js";
import { RequestDO } from "./request-do.js";
import { ANVIL_PNG_B64 } from "./anvil.js";

// Re-export the Durable Object classes so the runtime can bind them.
// SecretDO = outbound (send a secret out); RequestDO = inbound (collect one in).
export { SecretDO, RequestDO };

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

let ANVIL_BYTES = null;
function anvilPng() {
  if (!ANVIL_BYTES) {
    const bin = atob(ANVIL_PNG_B64);
    ANVIL_BYTES = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) ANVIL_BYTES[i] = bin.charCodeAt(i);
  }
  return new Response(ANVIL_BYTES, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
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

function isEmail(s) {
  return typeof s === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) && s.length <= 160;
}

// Inbound-request validation. The server never uses these keys cryptographically
// (all crypto is client-side); it stores them and re-serves the public key to
// submitters, so it just checks shape + bounds and caps sizes.
const MAX_FIELDS = 20;
const MAX_LABEL = 80;
const MAX_TITLE = 200;

function isB64url(s, maxLen) {
  return typeof s === "string" && s.length > 0 && s.length <= maxLen && /^[A-Za-z0-9_-]+$/.test(s);
}

// A P-256 public JWK, as WebCrypto exports it. x and y are 32-byte coords in
// base64url (~43 chars). We accept only this exact shape (no private `d`).
function isEcP256PublicJwk(jwk) {
  return (
    jwk &&
    typeof jwk === "object" &&
    jwk.kty === "EC" &&
    jwk.crv === "P-256" &&
    isB64url(jwk.x, 88) &&
    isB64url(jwk.y, 88) &&
    jwk.d === undefined
  );
}

// Sanitize a client-supplied field spec into [{label, secret}], or null if the
// shape is wrong. Empty labels and over-long lists are rejected by the caller.
function sanitizeFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > MAX_FIELDS) return null;
  const out = [];
  for (const f of fields) {
    if (!f || typeof f !== "object") return null;
    if (typeof f.label !== "string") return null;
    const label = f.label.trim();
    if (!label || label.length > MAX_LABEL) return null;
    out.push({ label, secret: !!f.secret });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transaction metadata (NOT the secret). Stored in KV per-key metadata so the
// history view is a single list() call. Holds a sender-chosen label, the
// recipient (if emailed), timestamps, status, and file/passphrase flags. The
// ciphertext and key are never here. Keyed by sha256(id) so the KV keyspace
// does not reveal circulating ids. Best-effort: never fails a create/reveal.
// ---------------------------------------------------------------------------
const META_TTL = 2592000; // keep history rows 30 days

async function sha256b64url(str) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return toB64url(new Uint8Array(d));
}

async function metaKey(id) {
  return "m:" + (await sha256b64url(id));
}

async function writeMeta(env, id, fields) {
  if (!env.SECRETS) return;
  try {
    await env.SECRETS.put(await metaKey(id), "1", {
      expirationTtl: META_TTL,
      metadata: fields,
    });
  } catch {
    /* metadata is best-effort */
  }
}

async function markOpened(env, id) {
  if (!env.SECRETS) return null;
  try {
    const key = await metaKey(id);
    const rec = await env.SECRETS.getWithMetadata(key);
    const md = rec && rec.metadata ? rec.metadata : null;
    if (!md) return null;
    md.s = "opened";
    md.o = Math.floor(Date.now() / 1000);
    await env.SECRETS.put(key, "1", { expirationTtl: META_TTL, metadata: md });
    return md;
  } catch {
    return null;
  }
}

async function listMeta(env) {
  if (!env.SECRETS) return [];
  try {
    const res = await env.SECRETS.list({ prefix: "m:", limit: 1000 });
    const rows = (res.keys || []).map((k) => k.metadata || {}).filter((m) => m && m.c);
    rows.sort((a, b) => (b.c || 0) - (a.c || 0));
    return rows.slice(0, 200);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Inbound-request metadata (NOT the submission). Separate KV keyspace ("rm:")
// from outbound secrets ("m:") so the two lists never collide. Keyed by
// sha256(token) so the KV keyspace never reveals a circulating submit token.
// Fields: t=title, c=created, e=expire, s=status (pending|submitted|claimed),
// n=field count, su=submittedAt, cl=claimedAt. Best-effort, like the outbound
// history: a KV hiccup never fails a create/submit/claim.
// ---------------------------------------------------------------------------
async function reqMetaKey(token) {
  return "rm:" + (await sha256b64url(token));
}

async function writeReqMeta(env, token, fields) {
  if (!env.SECRETS) return;
  try {
    await env.SECRETS.put(await reqMetaKey(token), "1", {
      expirationTtl: META_TTL,
      metadata: fields,
    });
  } catch {
    /* metadata is best-effort */
  }
}

async function updateReqMeta(env, token, mut) {
  if (!env.SECRETS) return;
  try {
    const key = await reqMetaKey(token);
    const rec = await env.SECRETS.getWithMetadata(key);
    const md = rec && rec.metadata ? rec.metadata : null;
    if (!md) return;
    mut(md);
    await env.SECRETS.put(key, "1", { expirationTtl: META_TTL, metadata: md });
  } catch {
    /* best-effort */
  }
}

async function listReqMeta(env) {
  if (!env.SECRETS) return [];
  try {
    const res = await env.SECRETS.list({ prefix: "rm:", limit: 1000 });
    const rows = (res.keys || [])
      .map((k) => (k.metadata ? { ...k.metadata, th: k.name.slice(3) } : null))
      .filter((m) => m && m.c);
    rows.sort((a, b) => (b.c || 0) - (a.c || 0));
    return rows.slice(0, 200);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Cockpit bridge (forgerpa-sales MS Graph pipe). Inert until SECURE_SHARE_SECRET
// is set. Used to email a recipient the link and to notify David on open.
// The link (which carries the key in its fragment) passes through here only for
// the opt-in email path; it is never logged or stored.
// ---------------------------------------------------------------------------
async function cockpitPost(env, path, payload) {
  if (!env.SECURE_SHARE_SECRET) return { ok: false, notConfigured: true };
  const base = env.COCKPIT_URL || "https://sales.forgerpa.com";
  try {
    const res = await fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-secure-share-secret": env.SECURE_SHARE_SECRET,
      },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 502 };
  }
}

async function notifyOpened(env, md) {
  if (!env.SECURE_SHARE_SECRET) return;
  await cockpitPost(env, "/api/secure-share/opened", {
    label: md && md.l ? md.l : "",
    recipient: md && md.r ? md.r : "",
    openedAt: Math.floor(Date.now() / 1000),
  });
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

  // Record non-secret transaction metadata for the history view.
  const nowSec = Math.floor(Date.now() / 1000);
  await writeMeta(env, id, {
    l: typeof body.label === "string" ? body.label.slice(0, 120) : "",
    // display-only; may be one email or a joined list (shared mode), so do not
    // gate on isEmail here.
    r: typeof body.to === "string" ? body.to.slice(0, 300) : "",
    c: nowSec,
    e: nowSec + ttlSec,
    s: "active",
    p: !!body.hasPass,
    f: !!body.hasFile,
  });

  return json({ id, ttl: ttlSec });
}

// ---------------------------------------------------------------------------
// API: reveal.  Body { id }. Returns { ct, iv } exactly once, then burns it.
// ---------------------------------------------------------------------------
async function handleReveal(request, env, ctx) {
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

  if (res.status === 200 && ctx) {
    // Record the open and notify the sender, off the response path.
    ctx.waitUntil(
      (async () => {
        const md = await markOpened(env, id);
        await notifyOpened(env, md);
      })(),
    );
  }

  return new Response(payload, {
    status: res.status,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

// ---------------------------------------------------------------------------
// API: send.  Access-gated (under /admin). Emails the recipient the link via
// the cockpit. The link carries the key in its fragment; per the sender's
// choice, it passes through the mail pipe here (never logged, never stored).
// ---------------------------------------------------------------------------
async function handleSend(request, env) {
  if (!(await accessAuthorized(request, env))) {
    return json({ error: "forbidden" }, 403);
  }
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await underLimit(env, "c", ip, cfg(env, "CREATE_LIMIT"), cfg(env, "CREATE_WINDOW")))) {
    return json({ error: "rate_limited" }, 429);
  }
  if (!env.SECURE_SHARE_SECRET) return json({ error: "email_not_configured" }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const { link, to, passphrase, alsoPass, label } = body || {};
  if (typeof link !== "string" || !/^https:\/\/\S+#\S+$/.test(link) || link.length > 4096) {
    return json({ error: "bad_request" }, 400);
  }
  if (!isEmail(to)) return json({ error: "bad_recipient" }, 400);

  const r = await cockpitPost(env, "/api/secure-share/send", {
    to,
    link,
    label: typeof label === "string" ? label.slice(0, 120) : "",
    passphrase: typeof passphrase === "string" ? passphrase : "",
    alsoEmailPassphrase: !!alsoPass && typeof passphrase === "string" && !!passphrase,
  });
  if (r.notConfigured) return json({ error: "email_not_configured" }, 503);
  if (!r.ok) return json({ error: "send_failed" }, 502);
  return json({ ok: true });
}

// ===========================================================================
// INBOUND: Secure Requests. David mints a request; an outside party submits
// credentials encrypted to it; David claims and decrypts them. The server holds
// only ciphertext + public keys. See request-do.js for the atomic state machine.
// ===========================================================================

// API: request-create (Access-gated, under /admin). Body
// { title, fields:[{label,secret}], ttl, pubJwk }. Returns { token, ttl }. The
// browser builds the submit link (/r/<token>) and the claim link
// (/admin/claim#<token>.<privJwk>) from the token; the private key never arrives
// here.
async function handleRequestCreate(request, env) {
  if (!(await accessAuthorized(request, env))) {
    return json({ error: "forbidden" }, 403);
  }
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await underLimit(env, "c", ip, cfg(env, "CREATE_LIMIT"), cfg(env, "CREATE_WINDOW")))) {
    return json({ error: "rate_limited" }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE) : "";
  if (!title) return json({ error: "bad_request" }, 400);

  const fields = sanitizeFields(body.fields);
  if (!fields) return json({ error: "bad_request" }, 400);

  if (!isEcP256PublicJwk(body.pubJwk)) return json({ error: "bad_request" }, 400);
  const pubJwk = { kty: "EC", crv: "P-256", x: body.pubJwk.x, y: body.pubJwk.y };

  const min = cfg(env, "MIN_TTL_SECONDS");
  const max = cfg(env, "MAX_TTL_SECONDS");
  let ttlSec = parseInt(body.ttl, 10);
  if (!Number.isFinite(ttlSec)) ttlSec = cfg(env, "DEFAULT_TTL_SECONDS");
  ttlSec = Math.min(max, Math.max(min, ttlSec));

  const token = newId();
  const nowSec = Math.floor(Date.now() / 1000);
  const stub = env.REQUEST_DO.get(env.REQUEST_DO.idFromName(token));
  const res = await stub.fetch("https://do/init", {
    method: "POST",
    body: JSON.stringify({ title, fields, pubJwk, ttl: ttlSec, createdAt: nowSec }),
  });
  if (!res.ok) return json({ error: "store_failed" }, 500);

  await writeReqMeta(env, token, {
    t: title,
    c: nowSec,
    e: nowSec + ttlSec,
    s: "pending",
    n: fields.length,
  });

  return json({ token, ttl: ttlSec });
}

// GET /r/<token>: the public submit page. Validates the token BEFORE rendering.
// Invalid, used, and expired all render one identical generic error (no oracle).
async function handleSubmitPage(request, env, token) {
  if (!isPlausibleId(token)) return html(renderRequestError(), 404);
  const stub = env.REQUEST_DO.get(env.REQUEST_DO.idFromName(token));
  const res = await stub.fetch("https://do/describe", { method: "POST" });
  if (!res.ok) return html(renderRequestError(), 404);
  let spec;
  try {
    spec = await res.json();
  } catch {
    return html(renderRequestError(), 404);
  }
  return html(renderSubmitPage(env, { token, title: spec.title, fields: spec.fields, pubJwk: spec.pubJwk }));
}

// API: submit (public). Body { token, ct, iv, wrapped, wrapIv, epk }. Atomically
// spends the single-use token and stores the encrypted payload. Never sees
// plaintext or any private key.
async function handleSubmit(request, env) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await underLimit(env, "r", ip, cfg(env, "REVEAL_LIMIT"), cfg(env, "REVEAL_WINDOW")))) {
    return json({ error: "rate_limited" }, 429);
  }

  const maxBytes = cfg(env, "MAX_CIPHERTEXT_BYTES");
  const declaredLen = parseInt(request.headers.get("content-length") || "0", 10);
  if (Number.isFinite(declaredLen) && declaredLen > maxBytes + 8192) {
    return json({ error: "too_large" }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const { token, ct, iv, wrapped, wrapIv, epk } = body || {};
  if (!isPlausibleId(token)) return json({ error: "bad_request" }, 400);
  if (typeof ct !== "string" || !/^[A-Za-z0-9+/=]+$/.test(ct)) return json({ error: "bad_request" }, 400);
  if (ct.length > maxBytes) return json({ error: "too_large" }, 413);
  if (typeof iv !== "string" || !/^[A-Za-z0-9+/=]+$/.test(iv) || iv.length > 64) {
    return json({ error: "bad_request" }, 400);
  }
  if (typeof wrapped !== "string" || !/^[A-Za-z0-9+/=]+$/.test(wrapped) || wrapped.length > 512) {
    return json({ error: "bad_request" }, 400);
  }
  if (typeof wrapIv !== "string" || !/^[A-Za-z0-9+/=]+$/.test(wrapIv) || wrapIv.length > 64) {
    return json({ error: "bad_request" }, 400);
  }
  if (!isEcP256PublicJwk(epk)) return json({ error: "bad_request" }, 400);
  const cleanEpk = { kty: "EC", crv: "P-256", x: epk.x, y: epk.y };

  const stub = env.REQUEST_DO.get(env.REQUEST_DO.idFromName(token));
  const res = await stub.fetch("https://do/submit", {
    method: "POST",
    body: JSON.stringify({ ct, iv, wrapped, wrapIv, epk: cleanEpk }),
  });
  if (res.status !== 200) return json({ error: "unavailable" }, 410);

  await updateReqMeta(env, token, (md) => {
    md.s = "submitted";
    md.su = Math.floor(Date.now() / 1000);
  });

  // v1 signal is the /admin/requests status list. An email/Discord "submission
  // received" receipt is deferred: the cockpit's /api/secure-share/opened endpoint
  // says "a secret you shared was opened and destroyed", which is untrue for an
  // inbound submission (nothing of yours was opened; something arrived for you to
  // claim). A truthful receipt needs a new cockpit endpoint
  // (/api/secure-share/submitted) in forgerpa-sales, which is out of scope here.

  return json({ ok: true });
}

// API: claim (Access-gated, under /admin). Body { token }. Atomically burns and
// returns the encrypted payload exactly once; a second claim gets 410. The
// browser decrypts with the private key from the claim-link fragment.
async function handleClaim(request, env, ctx) {
  if (!(await accessAuthorized(request, env))) {
    return json({ error: "forbidden" }, 403);
  }
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
  const token = body && body.token;
  if (!isPlausibleId(token)) return json({ error: "bad_request" }, 400);

  const stub = env.REQUEST_DO.get(env.REQUEST_DO.idFromName(token));
  const res = await stub.fetch("https://do/claim", { method: "POST" });
  const payload = await res.text();

  if (res.status === 200 && ctx) {
    ctx.waitUntil(
      updateReqMeta(env, token, (md) => {
        md.s = "claimed";
        md.cl = Math.floor(Date.now() / 1000);
      }),
    );
  }

  return new Response(payload, {
    status: res.status,
    headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------------
// Router.
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (method === "GET" || method === "HEAD") {
      // Public inbound submit page: /r/<token>. Prefix-matched; the handler
      // validates the token and renders a generic error for anything invalid.
      if (pathname.startsWith("/r/")) {
        let tok;
        try {
          tok = decodeURIComponent(pathname.slice(3));
        } catch {
          tok = "";
        }
        return handleSubmitPage(request, env, tok);
      }
      switch (pathname) {
        case "/":
          return redirect("/admin");
        case "/admin":
        case "/admin/":
          return html(renderCreatePage(env));
        case "/admin/history":
        case "/admin/history/":
          return html(renderHistoryPage(env, await listMeta(env)));
        case "/admin/create.js":
          return js(CREATE_JS);
        // Inbound: mint, status list, claim (all under /admin, Access-gated).
        case "/admin/request":
        case "/admin/request/":
          return html(renderRequestMintPage(env));
        case "/admin/request.js":
          return js(REQUEST_JS);
        case "/admin/requests":
        case "/admin/requests/":
          return html(renderRequestsPage(env, await listReqMeta(env)));
        case "/admin/requests.js":
          return js(REQUESTS_JS);
        case "/admin/claim":
        case "/admin/claim/":
          return html(renderClaimPage(env));
        case "/admin/claim.js":
          return js(CLAIM_JS);
        case "/submit.js":
          return js(SUBMIT_JS);
        case "/s":
        case "/s/":
          return html(renderViewPage(env));
        case "/reveal.js":
          return js(REVEAL_JS);
        case "/favicon.svg":
          return svg(FAVICON_SVG);
        case "/anvil-mark.png":
          return anvilPng();
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
      if (pathname === "/admin/api/send") return handleSend(request, env);
      if (pathname === "/api/reveal") return handleReveal(request, env, ctx);
      // Inbound POST routes.
      if (pathname === "/admin/api/request-create") return handleRequestCreate(request, env);
      if (pathname === "/admin/api/claim") return handleClaim(request, env, ctx);
      if (pathname === "/api/submit") return handleSubmit(request, env);
      return json({ error: "not_found" }, 404);
    }

    return json({ error: "method_not_allowed" }, 405);
  },
};
