/**
 * RequestDO: one Durable Object instance per INBOUND secure request (addressed by
 * idFromName(token)). This is the reverse of SecretDO: instead of David sending a
 * secret out, an outside party submits credentials IN, encrypted to a public key
 * whose private half never leaves David's browser.
 *
 * A DO runs single-threaded, and blockConcurrencyWhile makes the state changes
 * truly atomic, so the submit token is single-use (two simultaneous submits
 * cannot both win) and the claim burn has no race (two simultaneous claims cannot
 * both read the payload). This mirrors SecretDO's reveal-and-burn discipline.
 *
 * State machine:  pending -> submitted -> claimed  (or -> expired via alarm).
 *
 * The object stores only:
 *   - the request spec: title, fields (labels + is-secret flags), the request
 *     PUBLIC key (JWK). None of this is secret.
 *   - after a submit, the encrypted payload: { ct, iv, wrapped, wrapIv, epk } --
 *     all ciphertext or public keys. It never holds plaintext, the content key,
 *     or the request PRIVATE key (that lives only in David's claim-link fragment).
 *
 * An alarm destroys the object at expiry whether or not it was ever submitted or
 * claimed, so an unclaimed submission does not outlive the request's TTL.
 */
export class RequestDO {
  constructor(state) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Mint: initialize the request. Refuses to overwrite an existing request so
    // an id collision (astronomically unlikely) can never clobber another.
    if (request.method === "POST" && path === "/init") {
      const { title, fields, pubJwk, ttl, createdAt } = await request.json();
      const existing = await this.storage.get("status");
      if (existing) return json({ error: "exists" }, 409);
      const expireAt = Date.now() + ttl * 1000;
      await this.storage.put({
        title,
        fields,
        pubJwk,
        status: "pending",
        createdAt,
        expireAt,
      });
      await this.storage.setAlarm(expireAt);
      return json({ ok: true });
    }

    // Describe: read-only. Returns the spec the submit page needs (title, fields,
    // public key) only while the request is pending and unexpired. No mutation,
    // so a link-prefetching scanner that GETs the submit page cannot consume it.
    if (request.method === "POST" && path === "/describe") {
      const rec = await this.storage.get(["status", "title", "fields", "pubJwk", "expireAt"]);
      const status = rec.get("status");
      const expireAt = rec.get("expireAt");
      if (status !== "pending" || (expireAt != null && Date.now() > expireAt)) {
        return json({ error: "unavailable" }, 410);
      }
      return json({ title: rec.get("title"), fields: rec.get("fields"), pubJwk: rec.get("pubJwk") });
    }

    // Submit: atomically consume the single-use token and store the payload. The
    // token is spent the instant this succeeds; a second submit gets 410.
    if (request.method === "POST" && path === "/submit") {
      const payload = await request.json();
      let out = null;
      await this.state.blockConcurrencyWhile(async () => {
        const rec = await this.storage.get(["status", "expireAt"]);
        const status = rec.get("status");
        const expireAt = rec.get("expireAt");
        if (status !== "pending" || (expireAt != null && Date.now() > expireAt)) {
          out = 410;
          return;
        }
        await this.storage.put({ payload, status: "submitted", submittedAt: Date.now() });
        out = 200;
      });
      return json(out === 200 ? { ok: true } : { error: "unavailable" }, out);
    }

    // Claim: atomically read-and-burn the payload. The first claim returns it and
    // deletes it; a second claim (or a claim before any submit) gets 410 Gone.
    if (request.method === "POST" && path === "/claim") {
      let payload = null;
      await this.state.blockConcurrencyWhile(async () => {
        const rec = await this.storage.get(["status", "payload"]);
        const status = rec.get("status");
        const stored = rec.get("payload");
        if (status !== "submitted" || stored == null) {
          payload = null;
          return;
        }
        // Burn before returning: mark claimed, drop the ciphertext, cancel expiry.
        await this.storage.put({ status: "claimed", claimedAt: Date.now() });
        await this.storage.delete("payload");
        await this.storage.deleteAlarm();
        payload = stored;
      });
      if (payload == null) return json({ error: "gone" }, 410);
      return json(payload);
    }

    return json({ error: "not_found" }, 404);
  }

  // Fires at expiry: destroy the request and any unclaimed submission.
  async alarm() {
    await this.storage.deleteAll();
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
