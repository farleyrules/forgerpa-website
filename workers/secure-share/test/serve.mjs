/**
 * Local HTTP adapter: serves the REAL Worker module over http://localhost:8788
 * with in-memory stubs for the KV (rate limiting) and Durable Object (secrets)
 * bindings, so a browser can exercise the full create/reveal/burn flow including
 * the passphrase path. Used because workerd local dev does not start on this
 * Windows box. NOT for production.
 *
 * localhost is a secure context, so window.crypto.subtle is available.
 */
import { createServer } from "node:http";
import worker from "../src/index.js";

// In-memory Durable Object namespace stub. Node is single-threaded and requests
// are processed sequentially, so read-and-delete is atomic here by construction
// (mirroring the real DO's blockConcurrencyWhile guarantee).
function makeDONamespace() {
  const instances = new Map();
  const storageFor = (name) => {
    if (!instances.has(name)) instances.set(name, new Map());
    return instances.get(name);
  };
  return {
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
        return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      },
    }),
  };
}

// In-memory RequestDO namespace stub (mirrors src/request-do.js). Atomic here by
// Node's sequential request processing, like the real blockConcurrencyWhile.
function makeRequestDONamespace() {
  const instances = new Map();
  const storeFor = (name) => {
    if (!instances.has(name)) instances.set(name, new Map());
    return instances.get(name);
  };
  const rj = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  return {
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
          if (status !== "pending" || (expireAt != null && Date.now() > expireAt)) return rj({ error: "unavailable" }, 410);
          return rj({ title: store.get("title"), fields: store.get("fields"), pubJwk: store.get("pubJwk") });
        }
        if (method === "POST" && u.pathname === "/submit") {
          const status = store.get("status");
          const expireAt = store.get("expireAt");
          if (status !== "pending" || (expireAt != null && Date.now() > expireAt)) return rj({ error: "unavailable" }, 410);
          store.set("payload", body);
          store.set("status", "submitted");
          store.set("submittedAt", Date.now());
          return rj({ ok: true });
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
        return rj({ error: "not_found" }, 404);
      },
    }),
  };
}

const kv = new Map();
const kvMeta = new Map();
const env = {
  SECRET_DO: makeDONamespace(),
  REQUEST_DO: makeRequestDONamespace(),
  SECRETS: {
    async get(k) {
      return kv.has(k) ? kv.get(k) : null;
    },
    async getWithMetadata(k) {
      return { value: kv.has(k) ? kv.get(k) : null, metadata: kvMeta.has(k) ? kvMeta.get(k) : null };
    },
    async put(k, v, opts) {
      kv.set(k, v);
      if (opts && opts.metadata !== undefined) kvMeta.set(k, opts.metadata);
    },
    async delete(k) {
      kv.delete(k);
      kvMeta.delete(k);
    },
    async list(o) {
      const prefix = (o && o.prefix) || "";
      const keys = [...kv.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ name: k, metadata: kvMeta.get(k) }));
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
};

const PORT = 8788;

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const request = new Request("http://localhost:" + PORT + req.url, {
    method: req.method,
    headers: req.headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    redirect: "manual",
  });

  try {
    const ctx = { waitUntil(p) { Promise.resolve(p).catch(() => {}); } };
    const response = await worker.fetch(request, env, ctx);
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.statusCode = 500;
    res.end("adapter error: " + e.message);
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log("secure-share adapter on http://localhost:" + PORT);
});
