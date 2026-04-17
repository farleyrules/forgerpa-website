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

## Lead capture

Public resources stay **ungated**. Primary high-intent capture is **Cal.com** on **`/book`** (booker email, answers, and calendar hold). If you previously set `PUBLIC_FORMSPREE_TOOLKIT` in Cloudflare Pages for an old Resources form, you can remove that variable and redeploy.

## Build & Deploy Commands (Manual fallback)
```powershell
npm run build
npx wrangler pages deploy dist --project-name forgerpa-website --commit-dirty=true
```

**Last Updated**: March 30, 2026
