/**
 * Node harness that drives the REAL Worker module (src/index.js) with in-memory
 * stubs for the Durable Object (secrets) and KV (rate limiting) bindings, plus a
 * real client-equivalent AES-256-GCM round-trip and PBKDF2 passphrase wrap using
 * Node's Web Crypto. workerd local dev does not start on this Windows box, so
 * this verifies the security-critical logic + crypto without it.
 * Run: node test/harness.mjs
 */
import worker from "../src/index.js";
import { RequestDO } from "../src/request-do.js";

// ---- in-memory Durable Object namespace stub (sequential = atomic) ---------
function makeDONamespace() {
  const instances = new Map();
  const storageFor = (name) => {
    if (!instances.has(name)) instances.set(name, new Map());
    return instances.get(name);
  };
  return {
    _count: () => [...instances.values()].filter((s) => s.has("ct")).length,
    idFromName: (name) => ({ name }),
    get: (id) => ({
      async fetch(url, init) {
        const u = new URL(url);
        const method = (init && init.method) || "GET";
        const store = storageFor(id.name);
        if (method === "POST" && u.pathname === "/store") {
          const { ct, iv, ttl } = JSON.parse(init.body);
          store.set("ct", ct);
          store.set("iv", iv);
          store.set("expireAt", Date.now() + ttl * 1000);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (method === "POST" && u.pathname === "/reveal") {
          const ct = store.get("ct");
          const expireAt = store.get("expireAt");
          if (ct == null || (expireAt != null && Date.now() > expireAt)) {
            store.clear();
            return new Response(JSON.stringify({ error: "gone" }), {
              status: 410,
              headers: { "Content-Type": "application/json" },
            });
          }
          const iv = store.get("iv");
          store.clear();
          return new Response(JSON.stringify({ ct, iv }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "nf" }), { status: 404 });
      },
    }),
  };
}

// ---- in-memory RequestDO namespace stub (mirrors src/request-do.js) --------
// Node runs requests sequentially, so the read-check-write is atomic here by
// construction, mirroring the real DO's blockConcurrencyWhile guarantee. The
// real class's atomicity is exercised directly in section 19.
function makeRequestDONamespace() {
  const instances = new Map();
  const storeFor = (name) => {
    if (!instances.has(name)) instances.set(name, new Map());
    return instances.get(name);
  };
  const rj = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  return {
    _status: (name) => (instances.has(name) ? instances.get(name).get("status") : undefined),
    _hasPayload: (name) => !!(instances.has(name) && instances.get(name).get("payload")),
    _rawPayload: (name) => (instances.has(name) ? instances.get(name).get("payload") : undefined),
    _backdate: (name) => {
      if (instances.has(name)) instances.get(name).set("expireAt", Date.now() - 1000);
    },
    idFromName: (name) => ({ name }),
    get: (id) => ({
      async fetch(url, init) {
        const u = new URL(url);
        const method = (init && init.method) || "GET";
        const store = storeFor(id.name);
        const body = init && init.body ? JSON.parse(init.body) : {};
        if (method === "POST" && u.pathname === "/init") {
          if (store.get("status")) return rj({ error: "exists" }, 409);
          store.set("title", body.title);
          store.set("fields", body.fields);
          store.set("pubJwk", body.pubJwk);
          store.set("status", "pending");
          store.set("createdAt", body.createdAt);
          store.set("expireAt", Date.now() + body.ttl * 1000);
          return rj({ ok: true });
        }
        if (method === "POST" && u.pathname === "/describe") {
          const status = store.get("status");
          const expireAt = store.get("expireAt");
          if (status !== "pending" || (expireAt != null && Date.now() > expireAt)) {
            return rj({ error: "unavailable" }, 410);
          }
          return rj({ title: store.get("title"), fields: store.get("fields"), pubJwk: store.get("pubJwk") });
        }
        if (method === "POST" && u.pathname === "/submit") {
          const status = store.get("status");
          const expireAt = store.get("expireAt");
          if (status !== "pending" || (expireAt != null && Date.now() > expireAt)) {
            return rj({ error: "unavailable" }, 410);
          }
          const submittedAt = Date.now();
          store.set("payload", body);
          store.set("status", "submitted");
          store.set("submittedAt", submittedAt);
          // Submit cancels expiry: a submitted payload never expires (mirrors the
          // real DO's deleteAlarm). Represented here by clearing expireAt.
          store.delete("expireAt");
          return rj({ ok: true, submittedAt });
        }
        if (method === "POST" && u.pathname === "/claim") {
          const status = store.get("status");
          const payload = store.get("payload");
          if (status !== "submitted" || payload == null) return rj({ error: "gone" }, 410);
          store.set("status", "claimed");
          store.set("claimedAt", Date.now());
          store.delete("payload");
          return rj(payload);
        }
        if (method === "POST" && u.pathname === "/cancel") {
          store.clear();
          return rj({ ok: true });
        }
        return rj({ error: "nf" }, 404);
      },
    }),
  };
}

function makeEnv(extra) {
  const kv = new Map();
  const meta = new Map();
  return {
    SECRET_DO: makeDONamespace(),
    REQUEST_DO: makeRequestDONamespace(),
    SECRETS: {
      async get(k) {
        return kv.has(k) ? kv.get(k) : null;
      },
      async getWithMetadata(k) {
        return { value: kv.has(k) ? kv.get(k) : null, metadata: meta.has(k) ? meta.get(k) : null };
      },
      async put(k, v, opts) {
        kv.set(k, v);
        if (opts && opts.metadata !== undefined) meta.set(k, opts.metadata);
      },
      async delete(k) {
        kv.delete(k);
        meta.delete(k);
      },
      async list(o) {
        const prefix = (o && o.prefix) || "";
        const keys = [...kv.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((k) => ({ name: k, metadata: meta.get(k) }));
        return { keys, list_complete: true };
      },
    },
    DEFAULT_TTL_SECONDS: "259200",
    MIN_TTL_SECONDS: "300",
    MAX_TTL_SECONDS: "604800",
    MAX_CIPHERTEXT_BYTES: "153600",
    CREATE_LIMIT: "50",
    CREATE_WINDOW: "600",
    REVEAL_LIMIT: "100",
    REVEAL_WINDOW: "60",
    ...(extra || {}),
  };
}

const ORIGIN = "https://secure.forgerpa.com";
function get(path, env) {
  return worker.fetch(new Request(ORIGIN + path, { redirect: "manual" }), env);
}
function post(path, body, env, headers) {
  return worker.fetch(
    new Request(ORIGIN + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(headers || {}) },
      body: JSON.stringify(body),
    }),
    env,
  );
}

// ---- client-equivalent crypto ---------------------------------------------
const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString("base64");
const b64url = (buf) =>
  b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s) => new Uint8Array(Buffer.from(s, "base64"));
const fromB64url = (s) => fromB64(s.replace(/-/g, "+").replace(/_/g, "/"));
const PBKDF2_ITER = 210000;

async function encryptInBrowser(plaintext) {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return { ct: b64(ct), iv: b64(iv.buffer), rawKey, keyUrl: b64url(rawKey.buffer) };
}

async function decryptContent(ctB64, ivB64, rawKeyBytes) {
  const key = await crypto.subtle.importKey("raw", rawKeyBytes, { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, key, fromB64(ctB64));
  return new TextDecoder().decode(pt);
}

async function deriveWrapKey(passphrase, salt, usage) {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    usage,
  );
}

// ---- client-equivalent inbound crypto (ECDH-ES + HKDF) ---------------------
const HKDF_SALT = new TextEncoder().encode("forge-secure-request-hkdf-salt-v1");
const HKDF_INFO = new TextEncoder().encode("forge-secure-request-ecdh-es-v1");

async function genRequestKeypair() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
    "deriveKey",
  ]);
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { pubJwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, privJwk };
}

async function ecdhWrapKey(privKey, pubKey, usage) {
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: pubKey }, privKey, 256);
  const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO },
    hk,
    { name: "AES-GCM", length: 256 },
    false,
    usage,
  );
}

// Submitter side: encrypt the bundle with a fresh content key, ECDH-ES wrap it to
// the request public key. Returns exactly what the browser POSTs to /api/submit.
async function submitEncrypt(pubJwk, bundleObj) {
  const contentKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    contentKey,
    new TextEncoder().encode(JSON.stringify(bundleObj)),
  );
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", contentKey));
  const reqPub = await crypto.subtle.importKey("jwk", pubJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits", "deriveKey"]);
  const ephJwk = await crypto.subtle.exportKey("jwk", eph.publicKey);
  const wrapKey = await ecdhWrapKey(eph.privateKey, reqPub, ["encrypt"]);
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv }, wrapKey, rawKey);
  return {
    ct: b64(ctBuf),
    iv: b64(iv.buffer),
    wrapped: b64(wrapped),
    wrapIv: b64(wrapIv.buffer),
    epk: { kty: ephJwk.kty, crv: ephJwk.crv, x: ephJwk.x, y: ephJwk.y },
  };
}

// Claimer side: ECDH-ES unwrap the content key with the request private key, then
// decrypt the bundle. Mirrors CLAIM_JS.
async function claimDecrypt(privJwk, payload) {
  const reqPriv = await crypto.subtle.importKey("jwk", privJwk, { name: "ECDH", namedCurve: "P-256" }, false, [
    "deriveBits",
    "deriveKey",
  ]);
  const ephPub = await crypto.subtle.importKey("jwk", payload.epk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const wrapKey = await ecdhWrapKey(reqPriv, ephPub, ["decrypt"]);
  const rawKey = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(payload.wrapIv) }, wrapKey, fromB64(payload.wrapped)),
  );
  const contentKey = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(payload.iv) }, contentKey, fromB64(payload.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

// Fake DurableObjectState for driving the REAL RequestDO class directly. Records
// alarm calls so a test can assert the alarm lifecycle (set at init, cancelled at
// submit). blockConcurrencyWhile runs synchronously (Node is single-threaded).
function makeFakeState() {
  const map = new Map();
  const alarms = [];
  const storage = {
    async get(k) {
      if (Array.isArray(k)) {
        const m = new Map();
        for (const kk of k) if (map.has(kk)) m.set(kk, map.get(kk));
        return m;
      }
      return map.has(k) ? map.get(k) : undefined;
    },
    async put(obj) {
      for (const kk of Object.keys(obj)) map.set(kk, obj[kk]);
    },
    async delete(k) {
      map.delete(k);
    },
    async deleteAll() {
      map.clear();
    },
    async setAlarm(t) {
      alarms.push(["set", t]);
    },
    async deleteAlarm() {
      alarms.push(["del"]);
    },
  };
  return {
    state: {
      storage,
      async blockConcurrencyWhile(fn) {
        return fn();
      },
    },
    map,
    alarms,
  };
}

// ---- tiny assert framework -------------------------------------------------
let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  PASS  " + name);
  } else {
    fail++;
    console.log("  FAIL  " + name + (detail ? "  -> " + detail : ""));
  }
}

async function run() {
  const env = makeEnv();
  console.log("\nForge RPA Secure Share :: Node verification harness (v2)\n");

  // 1. Zero-knowledge round-trip via the DO-backed server, no passphrase.
  const SECRET = "SFTP host: sftp.onedatasource.com\nuser: mrco_forge\npass: Xj7#mQ!v2Lp$9wZ";
  const enc = await encryptInBrowser(SECRET);
  const createRes = await post("/admin/api/create", { ct: enc.ct, iv: enc.iv, ttl: 259200 }, env);
  const created = await createRes.json();
  ok("create returns 200", createRes.status === 200, "status=" + createRes.status);
  ok("create returns an id", typeof created.id === "string" && created.id.length >= 16);
  ok("DO holds exactly one secret", env.SECRET_DO._count() === 1, "count=" + env.SECRET_DO._count());

  const revealRes = await post("/api/reveal", { id: created.id }, env);
  const revealed = await revealRes.json();
  ok("first reveal returns 200", revealRes.status === 200, "status=" + revealRes.status);
  const roundtrip = await decryptContent(revealed.ct, revealed.iv, enc.rawKey);
  ok("decrypted plaintext matches original", roundtrip === SECRET);
  ok("secret burned from DO after reveal", env.SECRET_DO._count() === 0, "count=" + env.SECRET_DO._count());

  // 2. Burn after read: second reveal is Gone (atomic in the DO).
  const second = await post("/api/reveal", { id: created.id }, env);
  ok("second reveal returns 410 Gone", second.status === 410, "status=" + second.status);
  const unknown = await post("/api/reveal", { id: "abcdEFGH01234567" }, env);
  ok("unknown id returns 410 Gone", unknown.status === 410, "status=" + unknown.status);

  // 3. Passphrase round-trip: wrap the content key with PBKDF2, unwrap to read.
  const PASS = "correct horse battery staple";
  const PSECRET = "prod-db://user:S3cr3t!@db.internal:5432/forge";
  const e2 = await encryptInBrowser(PSECRET);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrapKey = await deriveWrapKey(PASS, salt, ["encrypt"]);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv }, wrapKey, e2.rawKey);
  const pCreate = await (await post("/admin/api/create", { ct: e2.ct, iv: e2.iv, ttl: 3600 }, env)).json();
  const pReveal = await post("/api/reveal", { id: pCreate.id }, env);
  const pBody = await pReveal.json();
  ok("passphrase secret reveals 200", pReveal.status === 200);
  // correct passphrase unwraps + decrypts
  const wrapKeyDec = await deriveWrapKey(PASS, salt, ["decrypt"]);
  const rawKeyBack = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: wrapIv }, wrapKeyDec, wrapped),
  );
  const pPlain = await decryptContent(pBody.ct, pBody.iv, rawKeyBack);
  ok("correct passphrase decrypts to original", pPlain === PSECRET);

  // 4. Wrong passphrase fails to unwrap the key (would abort BEFORE any fetch).
  let wrongThrew = false;
  try {
    const badKey = await deriveWrapKey("wrong passphrase", salt, ["decrypt"]);
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: wrapIv }, badKey, wrapped);
  } catch {
    wrongThrew = true;
  }
  ok("wrong passphrase cannot unwrap the key", wrongThrew);

  // 5. Access gate: with ACCESS_AUD set and no token, create is 403.
  const gated = makeEnv({ ACCESS_AUD: "test-aud", ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com" });
  const e3 = await encryptInBrowser("x");
  const blocked = await post("/admin/api/create", { ct: e3.ct, iv: e3.iv, ttl: 3600 }, gated);
  ok("Access-gated create with no token returns 403", blocked.status === 403, "status=" + blocked.status);
  // And inert when ACCESS_AUD unset: default env already created above (test 1).
  ok("Access inert when unconfigured (test 1 created ok)", created.id != null);

  // 6. Validation.
  const big = "A".repeat(153601);
  ok("oversized ciphertext returns 413", (await post("/admin/api/create", { ct: big, iv: "AAAA", ttl: 3600 }, env)).status === 413);
  ok("missing ct returns 400", (await post("/admin/api/create", { iv: "AAAA", ttl: 3600 }, env)).status === 400);
  ok("malformed id returns 400", (await post("/api/reveal", { id: "not a valid id !!" }, env)).status === 400);
  const lowTtl = await (await post("/admin/api/create", { ct: (await encryptInBrowser("x")).ct, iv: "AAAA", ttl: 10 }, env)).json();
  ok("ttl below min clamps up to 300", lowTtl.ttl === 300, "ttl=" + lowTtl.ttl);
  const hiTtl = await (await post("/admin/api/create", { ct: (await encryptInBrowser("x")).ct, iv: "AAAA", ttl: 9e8 }, env)).json();
  ok("ttl above max clamps down to 604800", hiTtl.ttl === 604800, "ttl=" + hiTtl.ttl);

  // 7. Routing + pages + headers.
  const root = await get("/", env);
  ok("GET / redirects to /admin", root.status === 302 && root.headers.get("location") === "/admin", "status=" + root.status);
  const admin = await get("/admin", env);
  const adminBody = await admin.text();
  ok("GET /admin serves create page", admin.status === 200 && adminBody.includes("Create a Secure Link"));
  ok("create page offers passphrase field", adminBody.includes('id="passphrase"'));
  ok("create page CSP is strict", (admin.headers.get("content-security-policy") || "").includes("default-src 'none'"));
  ok("create.js served at /admin/create.js", (await get("/admin/create.js", env)).status === 200);
  const view = await get("/s", env);
  const viewBody = await view.text();
  ok("GET /s serves view page", view.status === 200 && viewBody.includes("Reveal Secret"));
  ok("view page has hidden passphrase input", viewBody.includes('id="passphrase-in"'));
  ok("GET /favicon.svg serves svg", (await get("/favicon.svg", env)).headers.get("content-type").includes("svg"));
  ok("unknown path returns 404", (await get("/nope", env)).status === 404);
  ok("old /api/create path is gone (404)", (await post("/api/create", { ct: "x", iv: "y", ttl: 1 }, env)).status === 404);
  const robots = await get("/robots.txt", env);
  ok("robots.txt disallows all", (await robots.text()).includes("Disallow: /"));
  ok("PUT is 405", (await worker.fetch(new Request(ORIGIN + "/admin/api/create", { method: "PUT" }), env)).status === 405);

  // 8. Metadata + history + open-tracking.
  const mEnv = makeEnv();
  const em = await encryptInBrowser("history-check");
  const mCreate = await (
    await post("/admin/api/create", { ct: em.ct, iv: em.iv, ttl: 3600, label: "MRCO SFTP handoff", to: "vendor@example.com", hasPass: true, hasFile: false }, mEnv)
  ).json();
  const hist1 = await (await get("/admin/history", mEnv)).text();
  ok("history lists the label", hist1.includes("MRCO SFTP handoff"));
  ok("history lists the recipient", hist1.includes("vendor@example.com"));
  ok("history shows Active before open", hist1.includes(">Active<"));
  ok("history marks passphrase secrets", hist1.includes(">Passphrase<"));
  const ctx8 = { _p: [], waitUntil(p) { this._p.push(p); } };
  await worker.fetch(new Request(ORIGIN + "/api/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: mCreate.id }) }), mEnv, ctx8);
  await Promise.all(ctx8._p);
  const hist2 = await (await get("/admin/history", mEnv)).text();
  ok("history shows Opened after reveal", hist2.includes("Opened"));

  // Shared-mode joined recipient list is stored as-is (display-only, not gated on isEmail).
  const je = await encryptInBrowser("joined");
  await post("/admin/api/create", { ct: je.ct, iv: je.iv, ttl: 3600, label: "shared", to: "a@x.com, b@x.com, c@x.com" }, mEnv);
  const histJ = await (await get("/admin/history", mEnv)).text();
  ok("history stores a joined recipient list", histJ.includes("a@x.com, b@x.com, c@x.com"));

  // 9. Send endpoint is 503 when SECURE_SHARE_SECRET is unset (inert).
  const send503 = await post("/admin/api/send", { to: "v@x.com", link: "https://secure.forgerpa.com/s#abc.def" }, mEnv);
  ok("send is 503 when email unconfigured", send503.status === 503, "status=" + send503.status);

  // 10. Send + notify when configured (stub global fetch to the cockpit).
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    calls.push({ url: String(u), headers: (init && init.headers) || {}, body: (init && init.body) || "" });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const cfgEnv = makeEnv({ SECURE_SHARE_SECRET: "test-shared-secret", COCKPIT_URL: "https://cockpit.test" });
    const sres = await post("/admin/api/send", { to: "vendor@example.com", link: "https://secure.forgerpa.com/s#id123.key456", label: "L" }, cfgEnv);
    ok("send returns 200 when configured", sres.status === 200, "status=" + sres.status);
    const sendCall = calls.find((c) => c.url.includes("/api/secure-share/send"));
    ok("send POSTs to cockpit send endpoint", !!sendCall);
    ok("send passes the shared-secret header", !!(sendCall && sendCall.headers["x-secure-share-secret"] === "test-shared-secret"));
    ok("send body carries to + full link", !!(sendCall && sendCall.body.includes("vendor@example.com") && sendCall.body.includes("id123.key456")));

    calls.length = 0;
    const ne = await encryptInBrowser("notify-check");
    const nc = await (await post("/admin/api/create", { ct: ne.ct, iv: ne.iv, ttl: 3600, label: "notify-label", to: "r@x.com" }, cfgEnv)).json();
    const ctx = { _p: [], waitUntil(p) { this._p.push(p); } };
    await worker.fetch(new Request(ORIGIN + "/api/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: nc.id }) }), cfgEnv, ctx);
    await Promise.all(ctx._p);
    const openedCall = calls.find((c) => c.url.includes("/api/secure-share/opened"));
    ok("reveal notifies cockpit opened endpoint", !!openedCall);
    ok("opened payload has label but no key/ciphertext", !!(openedCall && openedCall.body.includes("notify-label") && !openedCall.body.includes("ct") && !/\bkey\b/.test(openedCall.body)));
  } finally {
    globalThis.fetch = realFetch;
  }

  // =========================================================================
  // INBOUND: Secure Requests (mint -> submit -> claim), zero-knowledge hybrid.
  // =========================================================================
  const rEnv = makeEnv();

  // 11. Full roundtrip: mint a request, submit a multi-field bundle, claim it.
  const kp = await genRequestKeypair();
  const fieldsSpec = [
    { label: "Username", secret: false },
    { label: "Password", secret: true },
    { label: "Company ID", secret: true },
  ];
  const rcRes = await post(
    "/admin/api/request-create",
    { title: "Sage Web Services Credentials for MRCO", fields: fieldsSpec, ttl: 259200, pubJwk: kp.pubJwk },
    rEnv,
  );
  const rc = await rcRes.json();
  ok("request-create returns 200", rcRes.status === 200, "status=" + rcRes.status);
  ok("request-create returns a token", typeof rc.token === "string" && rc.token.length >= 16);
  ok("request DO is pending", rEnv.REQUEST_DO._status(rc.token) === "pending");
  const listPending = await (await get("/admin/requests", rEnv)).text();
  ok("requests list shows the title", listPending.includes("Sage Web Services Credentials for MRCO"));
  ok("requests list shows Pending", listPending.includes(">Pending<"));

  // Submit page renders the requested fields (describe path), not the error page.
  const sp = await get("/r/" + rc.token, rEnv);
  const spBody = await sp.text();
  ok("submit page renders (200)", sp.status === 200, "status=" + sp.status);
  ok("submit page shows the title", spBody.includes("Sage Web Services Credentials for MRCO"));
  ok("submit page shows a requested field label", spBody.includes("Company ID"));
  ok("submit page embeds the request public key", spBody.includes(kp.pubJwk.x) && spBody.includes('id="req-data"'));

  const bundle = {
    v: 1,
    fields: [
      { label: "Username", value: "mrco_forge", secret: false },
      { label: "Password", value: "Xj7#mQ!v2Lp$9wZ", secret: true },
      { label: "Company ID", value: "MRCO-778", secret: true },
    ],
  };
  const subEnc = await submitEncrypt(kp.pubJwk, bundle);
  const subRes = await post("/api/submit", { token: rc.token, ...subEnc }, rEnv);
  ok("submit returns 200", subRes.status === 200, "status=" + subRes.status);
  ok("request DO is submitted", rEnv.REQUEST_DO._status(rc.token) === "submitted");
  ok("requests list flips to Submitted", (await (await get("/admin/requests", rEnv)).text()).includes("Submitted"));

  // Zero-knowledge: what the server stored must contain no plaintext value.
  const stored = JSON.stringify(rEnv.REQUEST_DO._rawPayload(rc.token));
  ok(
    "stored payload holds no plaintext value",
    !stored.includes("Xj7#mQ") && !stored.includes("mrco_forge") && !stored.includes("MRCO-778"),
  );

  // Claim with an explicit ctx so the off-path meta update (waitUntil) runs, as
  // the outbound "Opened" test does for markOpened.
  const claimCtx = { _p: [], waitUntil(p) { this._p.push(p); } };
  const clRes = await worker.fetch(
    new Request(ORIGIN + "/admin/api/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: rc.token }) }),
    rEnv,
    claimCtx,
  );
  ok("claim returns 200", clRes.status === 200, "status=" + clRes.status);
  const clPayload = await clRes.json();
  const decoded = await claimDecrypt(kp.privJwk, clPayload);
  ok("claim decrypts to the EXACT bundle", JSON.stringify(decoded) === JSON.stringify(bundle));
  ok(
    "request DO claimed + payload burned",
    rEnv.REQUEST_DO._status(rc.token) === "claimed" && !rEnv.REQUEST_DO._hasPayload(rc.token),
  );
  await Promise.all(claimCtx._p);
  ok("requests list shows Claimed", (await (await get("/admin/requests", rEnv)).text()).includes("Claimed"));

  // 12. Burn: a second claim is 410 Gone.
  ok("second claim returns 410", (await post("/admin/api/claim", { token: rc.token }, rEnv)).status === 410);

  // 13. Single-use submit token: a second submit on the same token is rejected.
  const kp2 = await genRequestKeypair();
  const rc2 = await (
    await post("/admin/api/request-create", { title: "Second", fields: [{ label: "Key", secret: true }], ttl: 3600, pubJwk: kp2.pubJwk }, rEnv)
  ).json();
  const enc2 = await submitEncrypt(kp2.pubJwk, { v: 1, fields: [{ label: "Key", value: "AAA", secret: true }] });
  ok("first submit ok", (await post("/api/submit", { token: rc2.token, ...enc2 }, rEnv)).status === 200);
  const enc2b = await submitEncrypt(kp2.pubJwk, { v: 1, fields: [{ label: "Key", value: "BBB", secret: true }] });
  ok("second submit on same token returns 410 (single-use)", (await post("/api/submit", { token: rc2.token, ...enc2b }, rEnv)).status === 410);

  // 14. Expired token: describe (submit page) + submit both rejected generically.
  const kp3 = await genRequestKeypair();
  const rc3 = await (
    await post("/admin/api/request-create", { title: "Exp", fields: [{ label: "K", secret: true }], ttl: 3600, pubJwk: kp3.pubJwk }, rEnv)
  ).json();
  rEnv.REQUEST_DO._backdate(rc3.token);
  ok("expired submit page shows generic error", (await (await get("/r/" + rc3.token, rEnv)).text()).includes("This Request Link Is Not Available"));
  const enc3 = await submitEncrypt(kp3.pubJwk, { v: 1, fields: [{ label: "K", value: "x", secret: true }] });
  ok("expired token submit returns 410", (await post("/api/submit", { token: rc3.token, ...enc3 }, rEnv)).status === 410);

  // 15. Field-spec validation on mint.
  ok("empty fields array -> 400", (await post("/admin/api/request-create", { title: "T", fields: [], ttl: 3600, pubJwk: kp.pubJwk }, rEnv)).status === 400);
  ok("field missing label -> 400", (await post("/admin/api/request-create", { title: "T", fields: [{ secret: true }], ttl: 3600, pubJwk: kp.pubJwk }, rEnv)).status === 400);
  ok(">20 fields -> 400", (await post("/admin/api/request-create", { title: "T", fields: Array.from({ length: 21 }, (_, i) => ({ label: "f" + i, secret: false })), ttl: 3600, pubJwk: kp.pubJwk }, rEnv)).status === 400);
  ok("missing title -> 400", (await post("/admin/api/request-create", { fields: [{ label: "K", secret: true }], ttl: 3600, pubJwk: kp.pubJwk }, rEnv)).status === 400);
  ok("incomplete pubJwk -> 400", (await post("/admin/api/request-create", { title: "T", fields: [{ label: "K", secret: true }], ttl: 3600, pubJwk: { kty: "EC", crv: "P-256" } }, rEnv)).status === 400);
  ok("pubJwk carrying private d rejected -> 400", (await post("/admin/api/request-create", { title: "T", fields: [{ label: "K", secret: true }], ttl: 3600, pubJwk: { ...kp.pubJwk, d: "AAAA" } }, rEnv)).status === 400);

  // 16. Submit size cap + payload validation.
  const kp4 = await genRequestKeypair();
  const rc4 = await (
    await post("/admin/api/request-create", { title: "Big", fields: [{ label: "K", secret: true }], ttl: 3600, pubJwk: kp4.pubJwk }, rEnv)
  ).json();
  const enc4 = await submitEncrypt(kp4.pubJwk, { v: 1, fields: [{ label: "K", value: "x", secret: true }] });
  const bigCt = "A".repeat(153601);
  ok("oversized ct -> 413", (await post("/api/submit", { token: rc4.token, ct: bigCt, iv: enc4.iv, wrapped: enc4.wrapped, wrapIv: enc4.wrapIv, epk: enc4.epk }, rEnv)).status === 413);
  ok("submit with malformed epk -> 400", (await post("/api/submit", { token: rc4.token, ct: enc4.ct, iv: enc4.iv, wrapped: enc4.wrapped, wrapIv: enc4.wrapIv, epk: { kty: "EC", crv: "P-256" } }, rEnv)).status === 400);
  ok("submit with malformed token -> 400", (await post("/api/submit", { token: "not a token !!", ct: enc4.ct, iv: enc4.iv, wrapped: enc4.wrapped, wrapIv: enc4.wrapIv, epk: enc4.epk }, rEnv)).status === 400);
  // rc4 is still pending (the 413/400 attempts did not spend it): a valid submit works.
  ok("valid submit after rejected attempts still works", (await post("/api/submit", { token: rc4.token, ...enc4 }, rEnv)).status === 200);

  // 17. No enumeration oracle: invalid/unknown submit tokens look identical.
  ok("bogus /r/<token> shows the generic error", (await (await get("/r/abcdEFGH01234567", rEnv)).text()).includes("This Request Link Is Not Available"));
  ok("empty /r/ is the generic error", (await (await get("/r/", rEnv)).text()).includes("This Request Link Is Not Available"));

  // 18. Access gate covers inbound mint + claim (defense in depth).
  const rGated = makeEnv({ ACCESS_AUD: "test-aud", ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com" });
  ok("gated request-create with no token -> 403", (await post("/admin/api/request-create", { title: "T", fields: [{ label: "K", secret: true }], ttl: 3600, pubJwk: kp.pubJwk }, rGated)).status === 403);
  ok("gated claim with no token -> 403", (await post("/admin/api/claim", { token: "abcdEFGH01234567" }, rGated)).status === 403);
  // Submit stays PUBLIC (no Access), like reveal: an unknown token is 410, not 403.
  ok("public submit needs no Access (unknown token -> 410)", (await post("/api/submit", { token: "abcdEFGH01234567", ...enc4 }, rGated)).status === 410);

  // 19. RequestDO atomic single-use + burn, on the REAL class with a fake state.
  {
    const map = new Map();
    const st = {
      storage: {
        async get(k) {
          if (Array.isArray(k)) {
            const m = new Map();
            for (const kk of k) if (map.has(kk)) m.set(kk, map.get(kk));
            return m;
          }
          return map.has(k) ? map.get(k) : undefined;
        },
        async put(obj) {
          for (const kk of Object.keys(obj)) map.set(kk, obj[kk]);
        },
        async delete(k) {
          map.delete(k);
        },
        async deleteAll() {
          map.clear();
        },
        async setAlarm() {},
        async deleteAlarm() {},
      },
      async blockConcurrencyWhile(fn) {
        return fn();
      },
    };
    const doInst = new RequestDO(st);
    const doReq = (path, bodyObj) =>
      doInst.fetch(new Request("https://do" + path, { method: "POST", body: bodyObj ? JSON.stringify(bodyObj) : undefined }));
    ok("DO init ok", (await doReq("/init", { title: "t", fields: [{ label: "K", secret: true }], pubJwk: {}, ttl: 3600, createdAt: 1 })).status === 200);
    ok("DO re-init refused (409)", (await doReq("/init", { title: "x", fields: [], pubJwk: {}, ttl: 1, createdAt: 2 })).status === 409);
    ok("DO describe returns pending spec", (await doReq("/describe")).status === 200);
    ok("DO first submit ok", (await doReq("/submit", { ct: "x", iv: "y", wrapped: "z", wrapIv: "w", epk: {} })).status === 200);
    ok("DO second submit rejected (single-use) 410", (await doReq("/submit", { ct: "x2", iv: "y", wrapped: "z", wrapIv: "w", epk: {} })).status === 410);
    ok("DO describe after submit is 410", (await doReq("/describe")).status === 410);
    const dc1 = await doReq("/claim");
    ok("DO first claim returns payload 200", dc1.status === 200);
    ok("DO claim returns the FIRST submission's ciphertext", (await dc1.json()).ct === "x");
    ok("DO second claim 410 (burned)", (await doReq("/claim")).status === 410);
  }

  // 20. Outbound flow is untouched and still serves (regression guard).
  ok("outbound create page still serves", (await (await get("/admin", rEnv)).text()).includes("Create a Secure Link"));
  ok("outbound /s reveal page still serves", (await (await get("/s", rEnv)).text()).includes("Reveal Secret"));
  ok("outbound reveal endpoint still burns (unknown id -> 410)", (await post("/api/reveal", { id: "abcdEFGH01234567" }, rEnv)).status === 410);

  // 21. Added fields: the per-field secret flag round-trips byte-exact through the
  // hybrid crypto (this is what drives claim-side masking).
  {
    const env21 = makeEnv();
    const kpA = await genRequestKeypair();
    const rcA = await (
      await post("/admin/api/request-create", { title: "Add", fields: [{ label: "Username", secret: false }], ttl: 3600, pubJwk: kpA.pubJwk }, env21)
    ).json();
    const bundleA = {
      v: 1,
      fields: [
        { label: "Username", value: "vendor1", secret: false },
        { label: "Registration ID", value: "REG-42", secret: true }, // added, secret
        { label: "Public Ref", value: "PR-9", secret: false }, // added, not secret
      ],
    };
    ok("added-field submit ok", (await post("/api/submit", { token: rcA.token, ...(await submitEncrypt(kpA.pubJwk, bundleA)) }, env21)).status === 200);
    const decA = await claimDecrypt(kpA.privJwk, await (await post("/admin/api/claim", { token: rcA.token }, env21)).json());
    ok("added secret field round-trips secret=true", decA.fields.some((f) => f.label === "Registration ID" && f.value === "REG-42" && f.secret === true));
    ok("added non-secret field round-trips secret=false", decA.fields.some((f) => f.label === "Public Ref" && f.value === "PR-9" && f.secret === false));
    ok("added-field bundle is byte-exact", JSON.stringify(decA) === JSON.stringify(bundleA));
  }

  // 22. Admin cancel/delete.
  {
    const env22 = makeEnv();
    const kpP = await genRequestKeypair();
    const rcP = await (await post("/admin/api/request-create", { title: "PendingKill", fields: [{ label: "K", secret: true }], ttl: 3600, pubJwk: kpP.pubJwk }, env22)).json();
    ok("cancel pending returns ok", (await post("/admin/api/request-cancel", { token: rcP.token }, env22)).status === 200);
    ok("cancelled submit page is the generic error", (await (await get("/r/" + rcP.token, env22)).text()).includes("This Request Link Is Not Available"));
    ok("cancelled token submit -> 410", (await post("/api/submit", { token: rcP.token, ...(await submitEncrypt(kpP.pubJwk, { v: 1, fields: [{ label: "K", value: "x", secret: true }] })) }, env22)).status === 410);
    ok("cancelled request purged from the list", !(await (await get("/admin/requests", env22)).text()).includes("PendingKill"));

    const kpS = await genRequestKeypair();
    const rcS = await (await post("/admin/api/request-create", { title: "SubKill", fields: [{ label: "K", secret: true }], ttl: 3600, pubJwk: kpS.pubJwk }, env22)).json();
    ok("submit before cancel ok", (await post("/api/submit", { token: rcS.token, ...(await submitEncrypt(kpS.pubJwk, { v: 1, fields: [{ label: "K", value: "s", secret: true }] })) }, env22)).status === 200);
    ok("cancel submitted returns ok", (await post("/admin/api/request-cancel", { token: rcS.token }, env22)).status === 200);
    ok("delete-from-submitted destroys payload -> claim 410", (await post("/admin/api/claim", { token: rcS.token }, env22)).status === 410);
    ok("submitted request purged from the list", !(await (await get("/admin/requests", env22)).text()).includes("SubKill"));

    const env22g = makeEnv({ ACCESS_AUD: "test-aud", ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com" });
    ok("gated cancel with no token -> 403", (await post("/admin/api/request-cancel", { token: "abcdEFGH01234567" }, env22g)).status === 403);
  }

  // 23. A submitted payload never expires: claim still succeeds after the original
  // submit-side expiry has passed (submit cancels expiry).
  {
    const env23 = makeEnv();
    const kpE = await genRequestKeypair();
    const rcE = await (await post("/admin/api/request-create", { title: "NoExpire", fields: [{ label: "K", secret: true }], ttl: 3600, pubJwk: kpE.pubJwk }, env23)).json();
    ok("submit ok", (await post("/api/submit", { token: rcE.token, ...(await submitEncrypt(kpE.pubJwk, { v: 1, fields: [{ label: "K", value: "keep", secret: true }] })) }, env23)).status === 200);
    env23.REQUEST_DO._backdate(rcE.token); // even if an expiry were set, it is in the past
    const clE = await post("/admin/api/claim", { token: rcE.token }, env23);
    ok("claim succeeds after original expiry (submitted never expires)", clE.status === 200);
    const decE = await claimDecrypt(kpE.privJwk, await clE.json());
    ok("post-expiry claim decrypts correctly", decE.fields[0].value === "keep");
    // The claim above used no ctx, so the row's metadata stays "submitted": the
    // list renders "awaiting claim", never a claim-by deadline.
    const listE = await (await get("/admin/requests", env23)).text();
    ok("requests list shows 'awaiting claim'", listE.includes("awaiting claim"));
    ok("requests list has no claim-by deadline", !/claim by/i.test(listE));
  }

  // 24. RequestDO alarm lifecycle on the REAL class: init sets an alarm, submit
  // CANCELS it, pending alarm() wipes, cancel destroys from any status.
  {
    const f = makeFakeState();
    const doInst = new RequestDO(f.state);
    const doReq = (p, b) => doInst.fetch(new Request("https://do" + p, { method: "POST", body: b ? JSON.stringify(b) : undefined }));
    await doReq("/init", { title: "t", fields: [{ label: "K", secret: true }], pubJwk: {}, ttl: 3600, createdAt: 1 });
    ok("DO init sets an alarm", f.alarms.some((a) => a[0] === "set"));
    f.alarms.length = 0;
    await doReq("/submit", { ct: "x", iv: "y", wrapped: "z", wrapIv: "w", epk: {} });
    ok("DO submit CANCELS the alarm (never expires)", f.alarms.some((a) => a[0] === "del"));
    ok("DO submit does NOT re-set an alarm", !f.alarms.some((a) => a[0] === "set"));
    ok("DO claim returns the payload after submit", (await doReq("/claim")).status === 200);

    const fp = makeFakeState();
    const doP = new RequestDO(fp.state);
    await doP.fetch(new Request("https://do/init", { method: "POST", body: JSON.stringify({ title: "p", fields: [{ label: "K", secret: true }], pubJwk: {}, ttl: 3600, createdAt: 1 }) }));
    await doP.alarm(); // expiry fires while pending
    ok("DO pending alarm() wipes -> describe 410", (await doP.fetch(new Request("https://do/describe", { method: "POST" }))).status === 410);
    ok("DO pending alarm() wipes -> submit 410", (await doP.fetch(new Request("https://do/submit", { method: "POST", body: JSON.stringify({ ct: "x", iv: "y", wrapped: "z", wrapIv: "w", epk: {} }) }))).status === 410);

    const fc = makeFakeState();
    const doC = new RequestDO(fc.state);
    await doC.fetch(new Request("https://do/init", { method: "POST", body: JSON.stringify({ title: "c", fields: [{ label: "K", secret: true }], pubJwk: {}, ttl: 3600, createdAt: 1 }) }));
    await doC.fetch(new Request("https://do/submit", { method: "POST", body: JSON.stringify({ ct: "x", iv: "y", wrapped: "z", wrapIv: "w", epk: {} }) }));
    ok("DO cancel returns ok", (await doC.fetch(new Request("https://do/cancel", { method: "POST" }))).status === 200);
    ok("DO cancel destroys payload -> claim 410", (await doC.fetch(new Request("https://do/claim", { method: "POST" }))).status === 410);
  }

  // 25. Submission receipt (fire-and-forget). With the shared secret set, submit
  // POSTs a NON-SECRET receipt off the response path; a throwing cockpit never
  // fails the submission, and the payload carries no ciphertext.
  {
    const realFetch = globalThis.fetch;
    const calls = [];
    const kpN = await genRequestKeypair();
    const envN = makeEnv({ SECURE_SHARE_SECRET: "test-secret", COCKPIT_URL: "https://cockpit.test" });
    const rcN = await (
      await post("/admin/api/request-create", { title: "NotifyMe", fields: [{ label: "K", secret: true }, { label: "L", secret: false }], ttl: 3600, pubJwk: kpN.pubJwk }, envN)
    ).json();
    const encN = await submitEncrypt(kpN.pubJwk, { v: 1, fields: [{ label: "K", value: "sekretvalue", secret: true }] });
    globalThis.fetch = async (u, init) => {
      calls.push({ url: String(u), body: (init && init.body) || "" });
      throw new Error("cockpit down"); // prove the submit still succeeds
    };
    try {
      const ctxN = { _p: [], waitUntil(p) { this._p.push(p); } };
      const subN = await worker.fetch(
        new Request(ORIGIN + "/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: rcN.token, ...encN }) }),
        envN,
        ctxN,
      );
      ok("submit returns 200 even when the receipt fetch throws", subN.status === 200, "status=" + subN.status);
      await Promise.all(ctxN._p.map((p) => Promise.resolve(p).catch(() => {})));
      const notif = calls.find((c) => c.url.includes("/api/secure-share/submitted"));
      ok("receipt POSTed to /api/secure-share/submitted", !!notif);
      ok("receipt carries title + fieldCount(2)", !!(notif && notif.body.includes("NotifyMe") && /"fieldCount":2/.test(notif.body)));
      ok("receipt has NO ciphertext or values", !!(notif && !/"ct"|"iv"|"wrapped"|"epk"|sekretvalue/.test(notif.body)));
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  console.log("\n" + pass + " passed, " + fail + " failed\n");
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(1);
});
