# Forge RPA Secure Share

Zero-knowledge, one-time-view encrypted secret links, on our own branded
subdomain. Built to hand vendors and clients SFTP passwords, keys, and
connection strings without leaning on 1Password or Bitwarden one-time shares.
The link itself doubles as a quiet competence signal to the client who receives
it.

**Live surface:** `https://secure.forgerpa.com` (see Deployment to change the
subdomain).

## Security model

- **Zero knowledge.** The secret is encrypted in the sender's browser with
  AES-256-GCM (Web Crypto). A random 256-bit key is generated client-side and
  placed **only in the URL fragment** (after `#`), which browsers never transmit
  to any server. This Worker only ever receives ciphertext. It cannot read the
  plaintext or the key, even under subpoena or a full server compromise.
- **Burn after read.** Ciphertext is stored in Cloudflare KV under `sha256(id)`
  with a TTL. The first successful reveal deletes it. A second reader gets
  `410 Gone` and the message "already viewed or has expired."
- **Nothing sensitive in a URL.** The id and key travel in the fragment (create)
  or a POST body (reveal), never in a request path or query string, so
  Cloudflare edge request logs contain no id, key, or ciphertext. We add no
  application logging of our own.
- **Locked-down headers.** Strict CSP (`default-src 'none'`, scripts same-origin
  only), HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `X-Robots-Tag: noindex`, `Cache-Control: no-store`. The decrypted secret is
  written to a textarea via `.value` (never `innerHTML`), so a hostile secret
  cannot inject script into the viewer's page.
- **No external requests.** Fonts fall back to the system stack, the anvil mark
  is inline SVG, and both client scripts are same-origin. The tool loads nothing
  from anywhere, which is why the strict CSP holds.
- **Abuse limits.** Per-IP rate limits on create (20 / 10 min) and reveal
  (60 / min), plus a 150 KB ciphertext cap.

## Files

| File | Role |
|---|---|
| `src/index.js` | Worker: router, KV, validation, rate limiting, security headers. Server-side crypto is only id generation + hashing the id into a KV key. |
| `src/pages.js` | The create + view HTML, inline CSS, and the two browser scripts (`CREATE_JS`, `REVEAL_JS`) where AES-GCM encrypt/decrypt actually happen. |
| `wrangler.jsonc` | Worker name, KV binding, custom-domain route, tunable limits. |
| `test/harness.mjs` | `node test/harness.mjs` drives the real Worker module with a KV stub and a real AES round-trip (26 checks). |
| `test/serve.mjs` | `node test/serve.mjs` serves the Worker on `http://localhost:8788` for a real-browser end-to-end test. |

## Deployment

This Worker is **independent of the forgerpa.com marketing site**. Pushing to
`main` does NOT deploy it (the Cloudflare Git connection only rebuilds the Astro
site). Deploy it explicitly with wrangler. All steps below need Cloudflare auth
once: run `npx wrangler login` (opens a browser, persists to your home config),
or set `CLOUDFLARE_API_TOKEN`.

```bash
cd workers/secure-share

# 1. Authenticate (one time).
npx wrangler login

# 2. Create the KV namespace and copy the returned id.
npx wrangler kv namespace create SECRETS

# 3. Paste that id into wrangler.jsonc (both "id" and "preview_id").

# 4. Deploy. custom_domain:true makes wrangler create the secure.forgerpa.com
#    custom domain AND its DNS record automatically (forgerpa.com is on
#    Cloudflare). No manual DNS.
npx wrangler deploy

# 5. Self-verify the live surface.
curl -s https://secure.forgerpa.com/healthz          # -> ok
# then open https://secure.forgerpa.com , create a link, reveal once, reload.
```

To roll back: `npx wrangler rollback`, or delete the Worker and the
`secure.forgerpa.com` DNS record in the Cloudflare dashboard. KV entries expire
on their own.

### Changing the subdomain

Edit the `routes` pattern in `wrangler.jsonc` (for example to
`share.forgerpa.com`) and redeploy. The client builds links from
`location.origin`, so nothing else needs to change.

## How to use it

1. Go to `https://secure.forgerpa.com`.
2. Paste the secret, pick an expiry (1h / 24h / 72h / 7d), click **Create Secure
   Link**.
3. Copy the link and send it to the recipient over your normal channel.
4. They open it, click **Reveal Secret**, and copy it. The link is now dead.

## Operational notes and caveats

- **Burn race (KV).** Cloudflare KV has no atomic read-and-delete, so two reveals
  landing inside KV's propagation window could in theory both succeed. In
  practice the link goes to one recipient out of band, so the window is not
  reachable. For hard atomic one-time semantics, upgrade the store to a
  **Durable Object** keyed by `idFromName(id)` (strong consistency, atomic
  read+delete; the SQLite-backed DO class is free-tier eligible). See v2.
- **Aggressive email scanners.** Some corporate mail-security gateways follow
  links and auto-click buttons, which could burn a secret before the human sees
  it. Every one-time-secret tool shares this. Mitigate by sending the link over a
  channel that does not deep-scan (Signal, SMS, a call), or use the v2 passphrase
  add-on, which a scanner cannot satisfy. Reveal is deliberately behind a button
  (never auto-fires on load), which stops passive link-preview bots.
- **TTL.** Default 72h. A secret also dies the moment it is revealed, whichever
  comes first.
- **No secret ever touches disk in plaintext.** Not on our servers (ciphertext
  only), and the sender's textarea is cleared after the link is created.

## Local testing (no Cloudflare needed)

```bash
cd workers/secure-share
node test/harness.mjs     # 26 server + crypto checks
node test/serve.mjs       # then browse http://localhost:8788 for a live e2e
```

`npx wrangler dev` does not start on some Windows boxes (workerd
`std::terminate()` on startup); the Node harness + adapter above cover the same
ground and drive the exact Worker module.

## v2 roadmap

- **Passphrase add-on.** Optional recipient passphrase mixed into key derivation
  (PBKDF2/Argon2 over the fragment key + passphrase), sent out of band. Defeats
  link interception and auto-clicking scanners.
- **Durable Object store** for atomic, race-free burn.
- **Sender receipt / notification** when a secret is opened (optional webhook to
  the sales cockpit).
- **Custom expiry input** and a max-views > 1 option for team credentials.
