/**
 * Node harness that drives the REAL Worker module (src/index.js) with a
 * Map-backed KV stub, and performs a real client-equivalent AES-256-GCM
 * round-trip using Node's Web Crypto. workerd local dev does not start on this
 * Windows box, so this verifies the security-critical server logic + crypto
 * without it. Run: node test/harness.mjs
 */
import worker from "../src/index.js";

// ---- Map-backed KV stub (records TTL so we can assert clamping) ------------
function makeKV() {
  const store = new Map();
  const ttls = new Map();
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value, opts) {
      store.set(key, value);
      if (opts && opts.expirationTtl != null) ttls.set(key, opts.expirationTtl);
    },
    async delete(key) {
      store.delete(key);
    },
    _size: () => store.size,
    _ttl: (key) => ttls.get(key),
    _keys: () => [...store.keys()],
  };
}

function makeEnv(kv) {
  return {
    SECRETS: kv,
    DEFAULT_TTL_SECONDS: "259200",
    MIN_TTL_SECONDS: "300",
    MAX_TTL_SECONDS: "604800",
    MAX_CIPHERTEXT_BYTES: "153600",
    CREATE_LIMIT: "20",
    CREATE_WINDOW: "600",
    REVEAL_LIMIT: "60",
    REVEAL_WINDOW: "60",
  };
}

const ORIGIN = "https://secure.forgerpa.com";
function get(path) {
  return worker.fetch(new Request(ORIGIN + path), envRef);
}
function post(path, body) {
  return worker.fetch(
    new Request(ORIGIN + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    envRef,
  );
}

// ---- client-equivalent crypto (this is what create.js does in the browser) -
const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString("base64");
const b64url = (buf) =>
  b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s) => new Uint8Array(Buffer.from(s, "base64"));
const fromB64url = (s) => fromB64(s.replace(/-/g, "+").replace(/_/g, "/"));

async function encryptInBrowser(plaintext) {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const rawKey = await crypto.subtle.exportKey("raw", key);
  return { ct: b64(ct), iv: b64(iv.buffer), keyUrl: b64url(rawKey) };
}

async function decryptInBrowser(ctB64, ivB64, keyUrl) {
  const key = await crypto.subtle.importKey(
    "raw",
    fromB64url(keyUrl),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) },
    key,
    fromB64(ctB64),
  );
  return new TextDecoder().decode(pt);
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

let envRef;

async function run() {
  // Fresh env per suite so rate limiting/KV do not bleed across cases.
  const kv = makeKV();
  envRef = makeEnv(kv);

  console.log("\nForge RPA Secure Share :: Node verification harness\n");

  // 1. Full zero-knowledge round-trip through the real server handlers.
  const SECRET = "SFTP host: sftp.onedatasource.com\nuser: mrco_forge\npass: Xj7#mQ!v2Lp$9wZ";
  const enc = await encryptInBrowser(SECRET);
  const createRes = await post("/api/create", {
    ct: enc.ct,
    iv: enc.iv,
    ttl: 259200,
  });
  const created = await createRes.json();
  ok("create returns 200", createRes.status === 200, "status=" + createRes.status);
  ok("create returns an id", typeof created.id === "string" && created.id.length >= 16, created.id);
  ok("server stored exactly one ciphertext", kv._size() === 1, "size=" + kv._size());
  ok("KV key is a sha256 hash, not the id", kv._keys()[0] && !kv._keys()[0].includes(created.id), kv._keys()[0]);

  const revealRes = await post("/api/reveal", { id: created.id });
  const revealed = await revealRes.json();
  ok("first reveal returns 200", revealRes.status === 200, "status=" + revealRes.status);
  const roundtrip = await decryptInBrowser(revealed.ct, revealed.iv, enc.keyUrl);
  ok("decrypted plaintext matches original", roundtrip === SECRET);
  ok("secret burned from KV after reveal", kv._size() === 0, "size=" + kv._size());

  // 2. Burn after read: a second reveal is Gone.
  const second = await post("/api/reveal", { id: created.id });
  ok("second reveal returns 410 Gone", second.status === 410, "status=" + second.status);

  // 3. Unknown id is Gone (indistinguishable from burned).
  const unknown = await post("/api/reveal", { id: "abcdEFGH01234567" });
  ok("unknown id returns 410 Gone", unknown.status === 410, "status=" + unknown.status);

  // 4. The server cannot decrypt (it never receives the key).
  const stored2 = await (async () => {
    const e2 = await encryptInBrowser("top secret");
    const r = await post("/api/create", { ct: e2.ct, iv: e2.iv, ttl: 3600 });
    const j = await r.json();
    // Try to decrypt what the server holds using only what the server has.
    const rev = await post("/api/reveal", { id: j.id });
    const body = await rev.json();
    return body; // has ct + iv, but NO key
  })();
  ok("reveal payload carries ct + iv but no key", "ct" in stored2 && "iv" in stored2 && !("key" in stored2));

  // 5. Validation: oversized ciphertext rejected 413.
  const big = "A".repeat(153601);
  const tooBig = await post("/api/create", { ct: big, iv: "AAAA", ttl: 3600 });
  ok("oversized ciphertext returns 413", tooBig.status === 413, "status=" + tooBig.status);

  // 6. Validation: missing fields rejected 400.
  const missing = await post("/api/create", { iv: "AAAA", ttl: 3600 });
  ok("missing ct returns 400", missing.status === 400, "status=" + missing.status);

  // 7. Validation: malformed id rejected 400 (not 410).
  const badId = await post("/api/reveal", { id: "not a valid id !!" });
  ok("malformed id returns 400", badId.status === 400, "status=" + badId.status);

  // 8. TTL clamping to [min,max].
  const lowTtl = await (async () => {
    const e = await encryptInBrowser("x");
    const r = await post("/api/create", { ct: e.ct, iv: e.iv, ttl: 10 });
    return r.json();
  })();
  ok("ttl below min clamps up to 300", lowTtl.ttl === 300, "ttl=" + lowTtl.ttl);
  const highTtl = await (async () => {
    const e = await encryptInBrowser("x");
    const r = await post("/api/create", { ct: e.ct, iv: e.iv, ttl: 99999999 });
    return r.json();
  })();
  ok("ttl above max clamps down to 604800", highTtl.ttl === 604800, "ttl=" + highTtl.ttl);

  // 9. Pages + assets + security headers.
  const home = await get("/");
  const homeBody = await home.text();
  ok("GET / serves create page", home.status === 200 && homeBody.includes("Create a Secure Link"));
  ok("create page sets strict CSP", (home.headers.get("content-security-policy") || "").includes("default-src 'none'"));
  ok("create page sets HSTS", (home.headers.get("strict-transport-security") || "").includes("max-age=63072000"));
  ok("create page is no-store", (home.headers.get("cache-control") || "").includes("no-store"));
  ok("create page is noindex", (home.headers.get("x-robots-tag") || "").includes("noindex"));

  const view = await get("/s");
  const viewBody = await view.text();
  ok("GET /s serves view page", view.status === 200 && viewBody.includes("Reveal Secret"));
  const cjs = await get("/create.js");
  ok("GET /create.js serves javascript", cjs.status === 200 && (cjs.headers.get("content-type") || "").includes("javascript"));
  const fav = await get("/favicon.svg");
  ok("GET /favicon.svg serves svg", fav.status === 200 && (fav.headers.get("content-type") || "").includes("svg"));
  const nf = await get("/nope");
  ok("unknown path returns 404", nf.status === 404);
  const robots = await get("/robots.txt");
  const robotsBody = await robots.text();
  ok("robots.txt disallows all", robots.status === 200 && robotsBody.includes("Disallow: /"));

  // 10. Method + payload guards.
  const putReq = await worker.fetch(new Request(ORIGIN + "/api/create", { method: "PUT" }), envRef);
  ok("PUT is 405 method not allowed", putReq.status === 405, "status=" + putReq.status);

  console.log("\n" + pass + " passed, " + fail + " failed\n");
  if (fail > 0) process.exit(1);
}

run().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(1);
});
