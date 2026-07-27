/**
 * SecretDO: one Durable Object instance per secret (addressed by
 * idFromName(id)). A DO runs single-threaded, and blockConcurrencyWhile makes
 * the read-and-delete truly atomic, so two simultaneous reveals cannot both
 * succeed: the first returns the ciphertext and deletes it, the second finds
 * nothing and gets 410. This closes the get-then-delete race that plain KV has.
 *
 * The object stores only ciphertext + iv (never the key or plaintext). An alarm
 * deletes it at expiry even if it is never revealed.
 */
export class SecretDO {
  constructor(state) {
    this.state = state;
    this.storage = state.storage;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && path === "/store") {
      const { ct, iv, ttl } = await request.json();
      const expireAt = Date.now() + ttl * 1000;
      await this.storage.put({ ct, iv, expireAt });
      await this.storage.setAlarm(expireAt);
      return json({ ok: true });
    }

    if (request.method === "POST" && path === "/reveal") {
      let payload = null;
      // Atomic: no other request to this object runs during this block.
      await this.state.blockConcurrencyWhile(async () => {
        const rec = await this.storage.get(["ct", "iv", "expireAt"]);
        const ct = rec.get("ct");
        const iv = rec.get("iv");
        const expireAt = rec.get("expireAt");
        if (ct == null || (expireAt != null && Date.now() > expireAt)) {
          await this.storage.deleteAll();
          await this.storage.deleteAlarm();
          payload = null;
          return;
        }
        // Burn before returning.
        await this.storage.deleteAll();
        await this.storage.deleteAlarm();
        payload = { ct, iv };
      });
      if (payload == null) return json({ error: "gone" }, 410);
      return json(payload);
    }

    return json({ error: "not_found" }, 404);
  }

  // Fires at expiry: destroy an unread secret.
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
