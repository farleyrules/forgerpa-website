# Forge RPA Secure Share

Zero-knowledge, one-time-view encrypted secret links, on our own branded
subdomain. Built to hand vendors and clients SFTP passwords, keys, and
connection strings without leaning on 1Password or Bitwarden one-time shares.
The link itself doubles as a quiet competence signal to the client who receives
it.

**Live surface:** `https://secure.forgerpa.com`
Creation is under `/admin` (gated by Cloudflare Access). Recipients only ever
use `/s#...` links, which need no login.

## Security model

- **Zero knowledge.** The secret is encrypted in the sender's browser with
  AES-256-GCM (Web Crypto). A random 256-bit key is generated client-side and
  placed **only in the URL fragment** (after `#`), which browsers never transmit
  to any server. The Worker only ever receives ciphertext. It cannot read the
  plaintext, the key, or the optional passphrase, even under a full server
  compromise.
- **Optional passphrase.** The sender can set a passphrase, delivered to the
  recipient out of band. It derives a key (PBKDF2, SHA-256, 210k iterations) that
  wraps the content key inside the fragment. The recipient must supply the
  passphrase to unwrap it, and that unwrap happens entirely client-side **before
  any server fetch**, so a wrong passphrase never burns the secret, and an
  auto-clicking email scanner (which has no passphrase) cannot burn it either.
- **Atomic burn after read.** Ciphertext lives in a per-secret **Durable Object**
  (`SecretDO`, addressed by `idFromName(id)`). `blockConcurrencyWhile` makes the
  read-and-delete atomic, so two simultaneous reveals cannot both succeed: the
  first returns the ciphertext and deletes it, the second gets `410 Gone`. An
  alarm destroys an unread secret at its TTL.
- **Creation is gated.** All create routes live under `/admin/*`, protected by
  Cloudflare Access (email one-time-PIN or SSO). `workers.dev` is disabled so the
  gate cannot be bypassed via a `*.workers.dev` URL, and the Worker also verifies
  the Access JWT on `POST /admin/api/create` when configured (defense in depth).
  The recipient side stays public.
- **Nothing sensitive in a URL.** The id and key travel in the fragment (create)
  or a POST body (reveal), never a path or query string, so Cloudflare edge
  request logs contain no id, key, or ciphertext. We add no application logging.
- **Locked-down headers.** Strict CSP (`default-src 'none'`, scripts same-origin
  only), HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `X-Robots-Tag: noindex`, `Cache-Control: no-store`. The decrypted secret is
  written to a textarea via `.value` (never `innerHTML`), so a hostile secret
  cannot inject script into the viewer's page. No external requests at all.
- **Abuse limits.** Per-IP rate limits on create (20 / 10 min) and reveal
  (60 / min) via KV counters, plus a 150 KB ciphertext cap.

## Files

| File | Role |
|---|---|
| `src/index.js` | Worker: router, DO calls, validation, rate limiting, Access JWT check, security headers. |
| `src/secret-do.js` | `SecretDO` Durable Object: atomic store / reveal-and-burn / expiry alarm. |
| `src/pages.js` | Create + view HTML, inline CSS, and the browser scripts (`CREATE_JS`, `REVEAL_JS`) where AES-GCM + the PBKDF2 passphrase wrap/unwrap happen. |
| `wrangler.jsonc` | Worker name, DO binding + migration, KV binding, custom-domain route, `workers_dev:false`, tunable limits, Access vars. |
| `test/harness.mjs` | `node test/harness.mjs`: 30 checks against the real Worker module with DO + KV stubs and a real AES + passphrase round-trip. |
| `test/serve.mjs` | `node test/serve.mjs`: serves the Worker on `http://localhost:8788` for a real-browser end-to-end test. |

## Deployment

This Worker is **independent of the forgerpa.com marketing site**. Pushing to
`main` does NOT deploy it. Deploy explicitly with wrangler (needs `npx wrangler
login` once, or `CLOUDFLARE_API_TOKEN`).

```bash
cd workers/secure-share
npx wrangler deploy        # publishes; applies the DO migration on first deploy
curl -s https://secure.forgerpa.com/healthz   # -> ok
```

The KV namespace id is already in `wrangler.jsonc`. To roll back:
`npx wrangler rollback`. To change the subdomain, edit the `routes` pattern and
redeploy (links build from `location.origin`, so nothing else changes).

## Gating: Cloudflare Access setup (one time, in the dashboard)

Access at the edge is the gate; the Worker JWT check is defense in depth. My
deploy token has no Access scope, so this part is done in the Cloudflare
dashboard:

1. Cloudflare dashboard -> **Zero Trust**. If first use, pick a team name (the
   free plan covers up to 50 users).
2. **Access -> Applications -> Add an application -> Self-hosted.**
3. Application domain: subdomain `secure`, domain `forgerpa.com`, **path
   `admin`**. This protects `secure.forgerpa.com/admin` and everything under it
   (the create page, `create.js`, and `POST /admin/api/create`). Everything else
   (`/s`, `/api/reveal`, `/favicon.svg`, `/healthz`) stays public.
4. Set a session duration (for example 24 hours). Leave the default identity
   method (**One-time PIN** by email) or add Google/Microsoft SSO.
5. **Add a policy:** Action **Allow**, Include **Emails** ->
   `david@texasexcelexpert.com` (add any teammates). Save.
6. Test: open `secure.forgerpa.com/admin` in a private window -> you should get
   the Access login (email PIN). Open a real `secure.forgerpa.com/s#...` link ->
   it should NOT prompt for login.

**Activate the Worker JWT check (optional, defense in depth):** from the Access
application's Overview, copy the **Application Audience (AUD)** tag and note your
team domain (`<team>.cloudflareaccess.com`). Add to `wrangler.jsonc` `vars`:

```jsonc
"ACCESS_TEAM_DOMAIN": "<team>.cloudflareaccess.com",
"ACCESS_AUD": "<application audience tag>"
```

then `npx wrangler deploy`. Until these are set, the Worker skips JWT
verification and relies on Access at the edge.

## How to use it

1. Go to `https://secure.forgerpa.com/admin` (log in via Access).
2. Paste the secret, pick an expiry, optionally set a passphrase, click **Create
   Secure Link**.
3. Copy the link and send it to the recipient. If you set a passphrase, send it
   **separately** (text or a call), never in the same message as the link.
4. They open the link, enter the passphrase if required, click **Reveal Secret**,
   and copy it. The link is now dead.

## Operational notes

- **Email scanners.** Passphrase-protected links are safe from mail-security
  gateways that auto-click links: the burn only fires after the passphrase
  unwraps the key client-side, which a scanner cannot do. For plain (no
  passphrase) links, a rare aggressive scanner could still pre-open one; send
  those over a channel that does not deep-scan, or just set a passphrase.
- **TTL.** Default 72h; a secret also dies the moment it is revealed.
- **Durable Object plan.** `SecretDO` uses SQLite-backed DO storage, available on
  the Workers free plan.

## Local testing (no Cloudflare needed)

```bash
cd workers/secure-share
node test/harness.mjs     # 30 server + crypto + passphrase + Access checks
node test/serve.mjs       # then browse http://localhost:8788/admin for a live e2e
```

`npx wrangler dev` does not start on some Windows boxes (workerd
`std::terminate()` on startup); the Node harness + adapter drive the exact Worker
module instead.

## v2 roadmap (remaining)

- **Sender receipt / notification** when a secret is opened (optional webhook to
  the sales cockpit).
- **Multi-view links** (max-views > 1) for a credential a small team all needs.
- **Custom expiry input** beyond the four presets.
