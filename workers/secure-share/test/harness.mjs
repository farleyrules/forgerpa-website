/**
 * Node harness that drives the REAL Worker module (src/index.js) with in-memory
 * stubs for the Durable Object (secrets) and KV (rate limiting) bindings, plus a
 * real client-equivalent AES-256-GCM round-trip and PBKDF2 passphrase wrap using
 * Node's Web Crypto. workerd local dev does not start on this Windows box, so
 * this verifies the security-critical logic + crypto without it.
 * Run: node test/harness.mjs
 */
import worker from "../src/index.js";

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

function makeEnv(extra) {
  const kv = new Map();
  const meta = new Map();
  return {
    SECRET_DO: makeDONamespace(),
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

  console.log("\n" + pass + " passed, " + fail + " failed\n");
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(1);
});
