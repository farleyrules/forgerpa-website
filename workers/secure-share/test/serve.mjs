/**
 * Local HTTP adapter: serves the REAL Worker module over http://localhost:8788
 * with an in-memory KV stub, so a browser can exercise the full create/reveal/
 * burn flow (including create.js and reveal.js). Used because workerd local dev
 * does not start on this Windows box. NOT for production.
 *
 * localhost is a secure context, so window.crypto.subtle is available.
 */
import { createServer } from "node:http";
import worker from "../src/index.js";

const store = new Map();
const env = {
  SECRETS: {
    async get(k) {
      return store.has(k) ? store.get(k) : null;
    },
    async put(k, v) {
      store.set(k, v);
    },
    async delete(k) {
      store.delete(k);
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
  });

  try {
    const response = await worker.fetch(request, env);
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
