# Forge RPA downloadables

Branded lead magnets and reference PDFs.

## Lead magnets (B6a / B6b)

| Deliverable | Web (print-friendly) | Source markdown (repo) |
|-------------|----------------------|-------------------------|
| Discovery Call Prep Worksheet | [/downloads/forge-rpa-discovery-prep.html](https://forgerpa.com/downloads/forge-rpa-discovery-prep.html) | `enterprise-automation-framework/docs/2026-04-29-b6a-discovery-call-prep-worksheet.md` |

### Saving as PDF

1. Open the `.html` link in Chrome or Edge.
2. **Print** → **Save as PDF** (or Microsoft Print to PDF).
3. Prefer **Letter** paper, default margins, background graphics **on** if colors look faint.

Optional: from the repo root, generate PDFs locally with Puppeteer-based tooling (requires a successful Chromium download):

```bash
cd enterprise-automation-framework/docs
npx md-to-pdf 2026-04-29-b6a-discovery-call-prep-worksheet.md
```

Then copy the generated `.pdf` files next to the Markdown sources into `forgerpa-website/public/downloads/` if you want versioned binary artifacts in Git.

## Other files

- `forgerpa-month-end-close-checklist.html` — legacy finance checklist (HTML).
