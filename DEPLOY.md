# Deployment Workflow for forgerpa-website

## Rule
All changes to the website must be made through Git commits and pushes to the `main` branch. Cloudflare Pages is connected to Git and will automatically deploy on push.

## How to Update the Website

### 1. Make Changes
Edit files in:
```bash
C:\Users\David\GitHub\forgerpa-website
```

### 2. Commit and Push
```powershell
cd "C:\Users\David\GitHub\forgerpa-website"

git add .
git commit -m "Brief description of changes"
git push origin main
```

### 3. Verify Deployment
- Go to Cloudflare Dashboard → Workers & Pages → forgerpa-website
- Check the "Deployments" tab for a new build
- Visit https://forgerpa.com to see changes (hard refresh with Ctrl+Shift+R)

## Content Management (Case Studies)
Case studies are now managed in `src/content/case-studies/*.md`. 
To add a new case study:
1. Create a new `.md` file in that folder
2. Follow the existing frontmatter format
3. Push to main

## Optional: Toolkit bundle email form (Resources page)

The Resources page includes an **optional** “email me the toolkit links” block. Individual downloads stay one-click and ungated.

1. Create a form at [Formspree](https://formspree.io/) (free tier is fine).
2. Copy the form endpoint URL (looks like `https://formspree.io/f/xxxxxxxx`).
3. In **Cloudflare Pages** → your project → **Settings** → **Environment variables** → **Production** (and Preview if you want):
   - Name: `PUBLIC_FORMSPREE_TOOLKIT`
   - Value: your Formspree URL
4. Trigger a new deployment (push to `main` or **Retry deployment** from the dashboard).

If this variable is **not** set at build time, the page shows a **mailto:** fallback to `info@forgerpa.com` so visitors can still request the bundle.

See also `.env.example` in this repo.

## Build & Deploy Commands (Manual fallback)
```powershell
npm run build
npx wrangler pages deploy dist --project-name forgerpa-website --commit-dirty=true
```

**Last Updated**: March 30, 2026
