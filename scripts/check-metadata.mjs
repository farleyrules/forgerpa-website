#!/usr/bin/env node
/**
 * Build-time metadata regression gate for forgerpa.com.
 *
 * Runs after `astro build`, scans every built page under dist/**\/*.html the way
 * an external SEO crawler reads the shipped markup, and FAILS the build (exit 1)
 * when any page regresses on one of three checks:
 *
 *   1. Doubled brand suffix   - the <title> carries "| Forge RPA" more than once
 *                               (the 2026-09-17 audit found this on 12 pages;
 *                               root cause was a caller passing an already
 *                               suffixed title into BaseLayout, which appends
 *                               the suffix again).
 *   2. Wrong <h1> count       - a page has zero or several <h1> in the shipped
 *                               HTML. This is a raw-token count on purpose: it
 *                               mirrors what naive SEO tools report, so it also
 *                               catches a stray "<h1>" shipped inside an inline
 *                               <script> comment (the /contact/ case in that
 *                               audit), which a DOM parser would miss.
 *   3. Missing meta description - no <meta name="description"> tag, or an empty one.
 *
 * It intentionally does NOT check title/description LENGTH. Length trims are
 * marketing-copy edits that go through human review, not a hard build gate.
 *
 * Zero dependencies (Node stdlib only) so it adds no runtime to the CI job and
 * runs against the dist/ the build just produced.
 *
 * Usage:
 *   node scripts/check-metadata.mjs            # gate: exit 1 on any failure
 *   node scripts/check-metadata.mjs --report   # list every finding, exit 0
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const REPORT_ONLY = process.argv.includes('--report');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BRAND_SUFFIX = '| Forge RPA';

/**
 * Directories (relative to dist/) excluded from the gate. `downloads/` holds
 * static, hand-authored print worksheets copied verbatim from public/downloads/.
 * They are download utilities, not indexed SEO pages: they are absent from the
 * sitemap and never rendered through BaseLayout, so the meta-description
 * contract does not apply to them. Add a prefix here only for another such
 * static passthrough, never to hide a real Astro page.
 */
const EXCLUDE_PREFIXES = ['downloads/'];

/** Recursively collect every *.html file under a directory. */
function collectHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectHtml(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

/** Count non-overlapping occurrences of a literal substring. */
function countSubstring(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

/** Number of <h1 ...> or <h1> start-tag tokens in the shipped HTML. */
function countH1(html) {
  const m = html.match(/<h1[\s>]/gi);
  return m ? m.length : 0;
}

/** The text inside the first <title>...</title>, whitespace-collapsed. */
function titleText(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

/** content of the first <meta name="description">, or null if absent. */
function metaDescription(html) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (/\bname=["']description["']/i.test(tag)) {
      const c = tag.match(/\bcontent=["']([\s\S]*?)["']/i);
      return c ? c[1].trim() : '';
    }
  }
  return null;
}

let files;
try {
  files = collectHtml(DIST);
} catch (err) {
  console.error(`check-metadata: cannot read ${relative(ROOT, DIST)}/ - run \`npm run build\` first.`);
  console.error(String(err.message || err));
  process.exit(2);
}

if (files.length === 0) {
  console.error(`check-metadata: no .html files found under ${relative(ROOT, DIST)}/.`);
  process.exit(2);
}

const failures = [];
let scanned = 0;
for (const file of files.sort()) {
  const rel = relative(DIST, file).replace(/\\/g, '/');
  if (EXCLUDE_PREFIXES.some((p) => rel.startsWith(p))) continue;
  scanned += 1;
  const html = readFileSync(file, 'utf8');

  const title = titleText(html);
  const suffixCount = title ? countSubstring(title, BRAND_SUFFIX) : 0;
  if (suffixCount >= 2) {
    failures.push({ rel, kind: 'doubled-suffix', detail: `"${title}"` });
  }

  const h1 = countH1(html);
  if (h1 !== 1) {
    failures.push({ rel, kind: 'h1-count', detail: `${h1} <h1> (expected exactly 1)` });
  }

  const desc = metaDescription(html);
  if (desc === null || desc === '') {
    failures.push({ rel, kind: 'missing-description', detail: desc === null ? 'no <meta name="description">' : 'empty description' });
  }
}

console.log(`check-metadata: scanned ${scanned} built page(s) under dist/ (${files.length - scanned} excluded).`);

if (failures.length === 0) {
  console.log('check-metadata: OK - no doubled title suffixes, every page has exactly one <h1> and a non-empty meta description.');
  process.exit(0);
}

const byKind = failures.reduce((acc, f) => ((acc[f.kind] = (acc[f.kind] || 0) + 1), acc), {});
console.error(`check-metadata: ${failures.length} finding(s): ${Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join(', ')}`);
for (const f of failures) {
  console.error(`  [${f.kind}] /${f.rel.replace(/index\.html$/, '').replace(/\.html$/, '')} - ${f.detail}`);
}

if (REPORT_ONLY) {
  console.error('check-metadata: --report mode, exiting 0 despite findings.');
  process.exit(0);
}
process.exit(1);
