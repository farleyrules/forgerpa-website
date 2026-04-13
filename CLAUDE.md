# Forge RPA Website

## Overview
Static website for [forgerpa.com](https://forgerpa.com), built with Astro 5 + Tailwind v4. Deployed via Cloudflare Pages.

## Important: This project is managed from the RPA-Agency repo
This website repo is maintained and updated from the companion project at `C:\Users\David\GitHub\RPA-Agency`. Content, blog posts, and updates originate there and are synced here via automation scripts.

**Do not edit content directly in this repo** — changes should be made in RPA-Agency and synced using:
```
cd C:\Users\David\GitHub\RPA-Agency
python scripts/sync_website.py
```

## Tech Stack
- Astro 5 (static output)
- Tailwind CSS v4 (CSS-based config via @tailwindcss/vite)
- @astrojs/sitemap, @astrojs/rss
- Deployed on Cloudflare Pages

## Commands
- **Dev:** `npm run dev` (localhost:4321)
- **Build:** `npm run build`
- **Preview:** `npm run preview`

## Structure
- `src/pages/` — All site pages (13 routes)
- `src/components/` — Reusable components (11)
- `src/layouts/` — Page layouts (3)
- `src/content/blog/` — Blog posts (Astro content collection)
- `src/styles/global.css` — Tailwind theme config
- `public/` — Static assets (favicon, PDFs)

## Design
- Colors: charcoal `#1a1a2e`, amber `#f59e0b`, white
- Font: Inter (Google Fonts)
- Responsive with mobile hamburger nav

## Deployment
Cloudflare Pages auto-deploys from `main` branch.
- Build command: `npm run build`
- Output directory: `dist`
- Environment: `NODE_VERSION=24`
