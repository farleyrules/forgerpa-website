# Forge RPA Secure Share

Zero-knowledge, one-time-view encrypted secret links, on our own branded
subdomain. Built to hand vendors and clients SFTP passwords, keys, and
connection strings without leaning on 1Password or Bitwarden one-time shares.
The link itself doubles as a quiet competence signal to the client who receives
it.

**Live surface:** `https://secure.forgerpa.com`
Creation is under `/admin` (gated by Cloudflare Access). Recipients only ever
use `/s#...` links, which need no login.

It runs in **both directions**:

- **Outbound** (send a secret out): `/admin` creates a burn-after-read `/s#...`
  link. See "Security model" below.
- **Inbound** (collect a secret in): `/admin/request` mints a **Secure Request**
  so an outside party (a client's vendor) can submit credentials to you, encrypted
  to a key only you hold, without anything sensitive touching email. See "Secure
  Requests (inbound)".

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
- **Files, not just text.** A file (SSH key, `.pem`/`.ppk`, small config, under
  50 KB) is wrapped in a small JSON envelope and encrypted client-side exactly
  like text, so the server stays file-agnostic and zero-knowledge. Reveal offers a
  one-time download.
- **Optional email delivery.** The sender can have the tool email the link to a
  recipient (branded, through the forgerpa-sales cockpit's Microsoft Graph pipe).
  The link carries the key in its fragment, so for the email path the key transits
  the mail pipe (the same exposure as sending it yourself); the storage server
  still never sees it and never logs it. Copy-paste delivery keeps the key off
  every server.
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
  (60 / min) via KV counters, plus a 120 KB ciphertext cap (files capped at
  50 KB, sized to stay under the Durable Object 128 KiB per-value limit).

## Send history + receipts

- **Send history** (`/admin/history`): a metadata-only log of created secrets
  (label, recipient, created time, status). It is stored in KV per-key metadata,
  never the secret itself, and rows expire 30 days after creation. A sender-chosen
  **Label** and optional **Email To** feed it.
- **Open-tracking + receipts.** A reveal flips the history row from Active to
  Opened and, off the response path (`ctx.waitUntil`), notifies the sender through
  the cockpit (email + a Discord ping). The receipt payload carries a label and
  time only, never the key or ciphertext.

## Secure Requests (inbound)

The reverse of the tool above: instead of sending a secret out, you collect one
in. Same zero-knowledge posture, same atomic single-use discipline.

- **Mint** (`/admin/request`, Access-gated). You name the request and list the
  fields to collect (each with a Secret flag; a Credential template prefills
  Username / Password / Company ID / Sender ID / API Endpoint / Notes). Your
  browser generates an ephemeral **ECDH P-256** keypair. The **public** half is
  stored server-side; the **private** half goes only into a **Claim Link** shown
  to you (in the URL fragment, never sent to a server). You get two links: a
  **Submit Link** (`/r/<token>`) to send the outside party, and the **Claim Link**
  (`/admin/claim#<token>.<privateKey>`) to keep. The Claim Link is also stashed in
  your browser's localStorage (keyed by `sha256(token)`) as a convenience.
- **Submit** (`/r/<token>`, public). The token is validated before the form
  renders; an invalid, used, or expired token shows one identical generic error
  (no enumeration oracle). The submitter fills the fields, and the browser: builds
  one JSON bundle, encrypts it with a fresh **AES-256-GCM** content key, then wraps
  that key to the request's public key via **ECDH-ES** (a fresh submitter-side
  ephemeral P-256 keypair + HKDF-SHA256). It POSTs `{ ct, iv, wrapped, wrapIv, epk }`
  to `/api/submit`, which atomically spends the single-use token (in `RequestDO`)
  and stores the payload. Plaintext, the content key, and any private key never
  reach the server.
- **Claim** (`/admin/claim`, Access-gated). Click **Reveal Submission** (click to
  burn, so a link-prefetching scanner cannot consume it). The Worker atomically
  burns and returns the payload once (a second claim gets `410 Gone`), and the
  browser derives the same ECDH-ES wrapping key with the private key from the
  fragment, unwraps the content key, decrypts the bundle, and renders the fields
  (secret fields masked, with per-field Show + Copy).
- **Status** (`/admin/requests`): pending / submitted / claimed / expired, metadata
  only, keyed by `sha256(token)` in a separate KV keyspace (`rm:`) from outbound
  history (`m:`). Where this browser stashed the Claim Link, an Open Claim link
  appears in the row.

`RequestDO` (one instance per request, addressed by `idFromName(token)`) is a
separate Durable Object class from `SecretDO`, so their id spaces never collide.
Its `blockConcurrencyWhile` makes both the submit-token spend and the claim burn
atomic, exactly like `SecretDO`'s reveal-and-burn.

**Submission receipt (deferred).** A "submission received" email/Discord ping is a
fast-follow, not in v1. The existing cockpit endpoint
`/api/secure-share/opened` says "a secure item you shared was opened and
destroyed", which is untrue for an inbound submission. A truthful receipt needs a
new `/api/secure-share/submitted` endpoint in forgerpa-sales; until then the
`/admin/requests` list is the signal.

## Files

| File | Role |
|---|---|
| `src/index.js` | Worker: router, DO calls, validation, rate limiting, Access JWT check, KV metadata (outbound history + inbound request status), the `/admin/api/send` email proxy + open-receipt bridge, the inbound mint / submit / claim handlers, security headers. |
| `src/secret-do.js` | `SecretDO` Durable Object (outbound): atomic store / reveal-and-burn / expiry alarm. |
| `src/request-do.js` | `RequestDO` Durable Object (inbound): atomic init / describe / single-use submit / claim-and-burn / expiry alarm. Stores only ciphertext + public keys. |
| `src/pages.js` | All HTML, inline CSS, and browser scripts. Outbound: create / view / history + `CREATE_JS` / `REVEAL_JS` (AES-GCM, PBKDF2 passphrase, file encode/decode). Inbound: mint / submit / claim / requests-list + `REQUEST_JS` / `SUBMIT_JS` / `CLAIM_JS` / `REQUESTS_JS` (ECDH-ES + HKDF hybrid). |
| `src/anvil.js` | The 3D anvil mark (base64 PNG) served at `/anvil-mark.png`. |
| `wrangler.jsonc` | Worker name, DO bindings (`SecretDO` + `RequestDO`) + migrations, KV binding, custom-domain route, `workers_dev:false`, tunable limits, Access + cockpit vars. |
| `test/harness.mjs` | `node test/harness.mjs`: 92 checks against the real Worker module (DO + KV stubs, real AES + passphrase + ECDH-ES round-trips, outbound history/receipts, inbound mint/submit/claim, single-use + burn, validation, plus a direct `RequestDO` atomicity test). |
| `test/serve.mjs` | `node test/serve.mjs`: serves the Worker on `http://localhost:8788` for a real-browser end-to-end test (both directions). |

Email delivery + open-receipts flow through two shared-secret endpoints in the
forgerpa-sales cockpit (`app/api/secure-share/{send,opened}`), which send via that
repo's Microsoft Graph pipe. See "Email setup" below.

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

## Email setup (link delivery + open-receipts)

These features are inert until a shared secret is set in BOTH places (same value):

```bash
# 1. Worker side
cd workers/secure-share && npx wrangler secret put SECURE_SHARE_SECRET
# 2. Vercel side (forgerpa-sales project), same value:
printf '%s' "<the same secret>" | vercel env add SECURE_SHARE_SECRET production
```

The cockpit endpoints also use the pre-existing `MS_GRAPH_*` mail creds and, for
receipts, `STEWARD_NOTIFY_TO` (defaults `david@forgerpa.com`) +
`DISCORD_WEBHOOK_SALES_GENERAL`. The Worker calls the cockpit at `COCKPIT_URL`
(defaults `https://sales.forgerpa.com`). Until the secret is set, the create UI
degrades to "Email is not set up yet. Copy the link and send it yourself."

## How to use it

1. Go to `https://secure.forgerpa.com/admin` (log in via Access).
2. Choose **Text** or **File**, enter the secret, pick an expiry. Optionally set a
   passphrase, a **Label** (for your history), and an **Email To** (to have the
   tool email the recipient the link). Click **Create Secure Link**.
3. If you did not set Email To, copy the link and send it yourself. If you set a
   passphrase, send it **separately** (text or a call), never with the link.
4. The recipient opens the link, enters the passphrase if required, clicks
   **Reveal Secret**, and copies it (or downloads the file). The link is now dead,
   and you get an open-receipt.
5. **Send History** (`/admin/history`) shows what you sent and whether it was
   opened.

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
node test/harness.mjs     # 92 checks: crypto, passphrase, files, burn, history, send/receipt, inbound requests
node test/serve.mjs       # then browse http://localhost:8788/admin (outbound) or /admin/request (inbound) for a live e2e
```

`npx wrangler dev` does not start on some Windows boxes (workerd
`std::terminate()` on startup); the Node harness + adapter drive the exact Worker
module instead.

## Roadmap (remaining)

- **Inbound submission receipt.** Add `/api/secure-share/submitted` to the
  forgerpa-sales cockpit (mirroring `/opened`) so a submission triggers a truthful
  "a submission is ready to claim" email + Discord ping, and have `handleSubmit`
  call it. Deferred from v1 because the existing `/opened` copy is untrue for the
  inbound direction (see "Secure Requests").
- **Receipts in Central time.** The cockpit's `/opened` email renders the open
  time in UTC (`toUTCString`); switch to `America/Chicago` for CT.
- **Recipient identity gate.** Optional email one-time-PIN so only a named
  recipient can open a link (stronger than a passphrase, but adds friction and a
  stored recipient-email hash).
- **Multi-view links** (max-views > 1) for a credential a small team all needs.
- **Custom expiry input** beyond the four presets.
- **Larger files** via R2 (current cap is 50 KB to fit the DO value limit).
