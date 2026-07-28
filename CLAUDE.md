# Forge RPA Website

## Project Overview
The PUBLIC marketing site for [forgerpa.com](https://forgerpa.com): a static Astro build that Cloudflare serves at the apex domain. It is the front door for lead generation, so a wrong claim here reaches prospects, not a log file. The content (services, industries, case studies, blog, ROI tools) is the product; the code is a thin shell around it.

Sessions root HERE, at `C:\Users\David\GitHub\forgerpa-website`. The former "this project is managed from RPA-Agency, do not edit content directly in this repo" rule was RETIRED 2026-07-15: edit this repo directly. The user-global conventions in `~/.claude/CLAUDE.md` apply automatically; this file holds only project-specific facts.

## Tech Stack
- Astro 5, `output: 'static'`, `site: 'https://forgerpa.com'`. No React, no UI framework: `.astro` plus inline `<script>`.
- Tailwind v4 via `@tailwindcss/vite`. Config is CSS-based in `src/styles/global.css` under `@theme`; there is no `tailwind.config.js`.
- `@astrojs/sitemap` (emits `dist/sitemap-index.xml`) and `@astrojs/rss` (`src/pages/rss.xml.ts`).
- Playwright (`@playwright/test`) for one e2e spec.
- No `.github/workflows`, no `vercel.json`, no `netlify.toml`. Nothing builds in CI. Cloudflare builds from the Git connection.

## Key Commands
- **Dev:** `npm run dev` (astro dev, port 4321).
- **Build:** `npm run build`. Verified green 2026-07-15: 72 pages in ~2.4s into `dist/`, which is gitignored.
- **Preview:** `npm run preview` (astro preview, a plain static server over `dist/`).
- **E2E:** `npx playwright test`. There is NO `test` script in `package.json`. See Gotchas: the suite is currently stale.

## Structure
- `src/pages/` 43 page files that build to 72 pages (dynamic `[slug]` routes expand): services (15), industries (8), faq (3), tools (2), blog, case studies, legal.
- `src/components/` 14. `src/layouts/` 4 (`BaseLayout`, `PageLayout`, `BlogLayout`, `CaseStudyLayout`).
- `src/content/` Astro content collections, schemas in `src/content/config.ts`: `blog/` (7) and `case-studies/` (11).
- `src/lib/` the `/contact` discovery-qualifier wizard (`qualifier-init|state|types|validation.ts`) plus `case-study-links.ts`.
- `public/` favicons, OG image, `_redirects`, `robots.txt`, `llms.txt` + `llms-full.txt`, `downloads/`, `pdfs/`.
- `e2e/` one Playwright spec. `wrangler.jsonc` Cloudflare assets config. `DEPLOY.md` is partly stale (see Deployment).

## Deployment
Cloudflare builds and serves from `main`. There is no CI in this repo: pushing to `main` IS the deploy.
- Build command `npm run build`, output directory `dist`. `NODE_VERSION=24` lives in the Cloudflare dashboard, not in the repo (no `.nvmrc`, no `engines` field), so it cannot be verified from here.
- `wrangler.jsonc` declares `assets.directory: ./dist`. It exists because the Cloudflare deploy step (`npx wrangler versions upload`) failed on every build from ~2026-06-20 with "Missing entry-point to Worker script or to assets directory" until it was added (d74ad70, 2026-06-22). That makes this a **Workers Static Assets / Workers Builds** project; the migration came from the bot branch `origin/cloudflare/workers-autoconfig` (2026-06-20), which is still unmerged.
- `DEPLOY.md` still calls the target "Cloudflare Pages" and offers `wrangler pages deploy` as a manual fallback. Treat that naming as legacy and trust `wrangler.jsonc`. `DEPLOY.md` also still describes Cal.com on `/book` as primary capture, which `_redirects` has since retired.

## Secure Share (secure.forgerpa.com)
A standalone, zero-knowledge one-time-secret tool lives in `workers/secure-share/`: its own Cloudflare Worker (`forge-secure-share`), a per-secret Durable Object (`SecretDO`) for storage, and a KV namespace (`SECRETS`) used only for rate-limit counters. Forge-branded, for handing vendors and clients SFTP passwords, keys, and connection strings without 1Password/Bitwarden. It is NOT part of the Astro site: `astro build` ignores it (it sits outside `src/`), and **the git push to `main` that deploys the marketing site does NOT deploy it.** Deploy it explicitly: `cd workers/secure-share && npx wrangler deploy` (needs `npx wrangler login` once). Secrets are AES-256-GCM encrypted in the browser; the 256-bit key rides only in the URL fragment and never reaches the server; ciphertext lives in the Durable Object and burns atomically on first read (second read gets 410 Gone). An optional passphrase (PBKDF2) wraps the key client-side. Creation is under `/admin`, gated by Cloudflare Access (`workers.dev` disabled); the recipient side (`/s`) is public. It also shares files (keys/certs under 50 KB), keeps a metadata-only Send History at `/admin/history`, and can email the recipient the branded link + notify David on open. Email/receipts flow through two shared-secret endpoints in the **forgerpa-sales** cockpit (`app/api/secure-share/{send,opened}`, which send via that repo's MS Graph pipe); they are gated by a shared `SECURE_SHARE_SECRET` set on BOTH the Worker (`wrangler secret put`) and in Vercel, and are inert until it is set. Full runbook, the Access + email setup steps, and offline tests (`node test/harness.mjs` (42 checks), `node test/serve.mjs`, since workerd `wrangler dev` will not start on this box) are in `workers/secure-share/README.md`. Live and verified end to end 2026-07-27.

## Gotchas
- **A push is not a deploy.** The Cloudflare Git webhook has silently missed pushes: three commits exist only to re-trigger a build (819bf11, f3638cc, b07a873 "git webhook miss"). A green `astro build` is not a deploy either: for two days in June every build was green while the deploy step failed. After pushing, confirm the change is actually live (`curl` the page); do not trust the push.
- **`.env.production` is committed on purpose.** Only `PUBLIC_*` vars live there, and Astro inlines their values into the static HTML at build time, so they are already visible in every deployed page's source and there is no secret to protect. The file documents this itself. Do not "fix" it as a leak. `.env` is gitignored. Names in use, all read in `BaseLayout.astro`: `PUBLIC_GA4_MEASUREMENT_ID`, `PUBLIC_GSC_VERIFICATION_TOKEN`, `PUBLIC_GOOGLE_ADS_CONVERSION_ID`.
- **Runtime dependency on the forgerpa-sales cockpit.** The `/contact` wizard and the calculators POST to `https://sales.forgerpa.com`: `/api/warm-intake/discovery-qualifier`, `/api/warm-intake/lead-magnet`, `/api/turnstile-site-key`. This static site cannot capture a lead on its own; changing those contracts means changing that repo too.
- **The e2e suite is stale.** `playwright.config.ts` (webServer url) and `e2e/gclid-capture.spec.ts` (LANDING_URL) both target `/book`, but `src/pages/book.astro` was deleted in #42 when /book folded into /contact. Verified 2026-07-15: a fresh build produces no `dist/book`, and `astro preview` returns 404 for `/book` while `/contact` returns 200. Retarget it at `/contact` before trusting it.
- **`public/_redirects` is Cloudflare-side only.** `/book -> /contact 301` works in prod (verified: `/book?from=assessment` 301s to `/contact?from=assessment`, query string preserved) but is never applied by `astro preview`, which is why the redirect does not rescue the e2e test above.
- **`RPA-Agency/scripts/sync_website.py` still exists and overwrites.** It copies `outputs/blog_posts/` into `src/content/blog/` and sales-collateral PDFs into `public/pdfs/`, and `--commit` commits and pushes here. It is no longer the workflow, but it can still clobber a blog post edited in this repo. Nothing runs it on a schedule (the weekly keyword cron does not touch this repo).
- Cloudflare 307s `/tools/roi-calculator` to `/tools/roi-calculator/`. Trailing-slash normalization, not a bug.

## Content Rules (this repo is public)
- **The CPA rule is compliance here, not style.** David's California license (1997) is INACTIVE, and California restricts the unqualified title. Never publish "CPA", "a CPA", or "Built by a CPA". Use "CPA background", "CPA-trained", "former CPA", "CPA (inactive)", or "30-year finance and accounting veteran". Live copy already complies; keep it that way.
- **Two credential scopes, never mixed.** Career-wide is "hundreds of automations". The employer proof point is "100+ at a Fortune **Global** 500 manufacturer": that employer's parent is non-US, so it is NOT the US Fortune 500. Both have been wrong in production and both fixes shipped as content corrections (#60 Fortune Global, #61 hundreds). Grep `CPA`, `Fortune`, and `automations` before shipping a credential claim. `public/llms.txt` and `public/llms-full.txt` are HAND-maintained and carry these claims, so they go stale first.
- **Title Case for structural UI labels, but hero and marketing headlines are EXEMPT.** This is the repo where the global "flag headlines, do not auto-case" rule bites. Nav, buttons, CTAs, section and card headers, table headers, and page `<title>` get Title Case. Hero and marketing headlines are a deliberate voice choice in sentence case: leave them and flag them for David rather than recasing. `/contact`'s hero is a single `HERO_HEADLINE` constant precisely so it stays under human control.
- Blog `draft: true` excludes a post from the listing, its route, tag pages, and RSS. The weekly content engine writes anchor-post skeletons as drafts with voice gates in an HTML comment; write the prose, then flip `draft: false`.
- Case studies with `composite` in the filename are composites, not single named clients. Never name a client.

## ROI Calculators (lead gen)
Ungated by design: the email gates were retired in #56 and #57 and the pages advertise "no email required". They are the site's main non-booking conversion asset.
- `src/components/RoiCalculator.astro` is ONE source of truth for the labor-savings model (documented in its header). It renders full on `/tools/roi-calculator` and compact-embedded on `services/accounts-payable-automation`, `services/ap-reconciliation-assessment`, and `services/month-end-close-assessment`. Change the model once, in the component.
- `src/components/DataLakeRoiCalculator.astro` backs `/tools/data-lake-roi` and `services/data-lake`.
- Each instance self-scopes with a `uid`, so two calculators on one page never share element ids. The optional soft email capture POSTs to the cockpit's `/api/warm-intake/lead-magnet`.

## Design
- Colors (`@theme` in `src/styles/global.css`): charcoal `#1a1a2e`, amber `#f59e0b`, plus light/dark variants and `--color-slate-light`.
- Font: Inter. Responsive, with a mobile hamburger nav.
- `.blog-content` typography is explicit CSS: `@tailwindcss/typography` is deliberately NOT installed.

## Code Style
- No em or en dashes in any authored text (global rule). Periods, colons, semicolons, parentheses, hyphens.
- UI labels Title Case; body and help text sentence case. Hero headlines exempt (above).
- Scope-prefixed commit messages, one logical change per commit.
- Both workflows are normal here: roughly two thirds of the last 60 commits landed DIRECTLY on `main`, the rest by PR. Unlike forgerpa-app, this repo does not require a PR. `main` is the durable branch and is what Cloudflare builds.

## Brain & Memory
This repo holds code and shippable content only. Knowledge lives in the Brain vault: `C:\Users\David\Brain\10-Projects\forgerpa-website\` (`_Start-Here.md`, `sessions/`, `decisions/`, `issues/`, `anti-patterns.md`).
- Loop: `/catchup` to wake, `/remember` `/decision` `/solved` `/idea` `/win` to capture as you go, `/wrap` to close, `/weekly` for the weekly review. Run `/commands` for the current list.
- Do not put handoffs, session logs, or an Obsidian vault into this repo.
