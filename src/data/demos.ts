/**
 * Demo video library for /demos.
 *
 * Adding a video is a data change: drop the web encode at
 * `public/demos/<slug>.mp4` and its poster at `public/demos/<slug>.jpg`,
 * then add one entry below. The page derives the player, the poster and the
 * schema.org VideoObject from the entry.
 *
 * Encodes are silent H.264 (1920x1080, 30 fps, captions burned in):
 *   ffmpeg -i <src> -an -c:v libx264 -preset slow -crf 26 -tune stillimage
 *     -vf scale=out_range=tv -pix_fmt yuv420p -color_range tv
 *     -movflags +faststart <slug>.mp4
 * The out_range/color_range flags convert the full-range source to standard
 * limited-range yuv420p (newer ffmpeg otherwise keeps it full range). Posters
 * are 1280x720 JPEGs (quality 80) about 1 s into each video's overview scene.
 * Every file must stay under the 25 MiB Workers Static Assets per-file limit.
 */

export type DemoCategory = 'finance' | 'healthcare';

export interface Demo {
  /** File stem for /demos/<slug>.mp4 and /demos/<slug>.jpg. */
  slug: string;
  title: string;
  /** Who the video is for, shown under the title. */
  audience: string;
  description: string;
  /** Exact length of the encode in seconds (from ffprobe). */
  durationSeconds: number;
  category: DemoCategory;
  /** ISO date (YYYY-MM-DD) the video was published, for the VideoObject. */
  uploadDate: string;
}

export interface DemoSection {
  category: DemoCategory;
  heading: string;
}

/** Section order on the page. */
export const demoSections: DemoSection[] = [
  { category: 'finance', heading: 'Finance and Accounting' },
  { category: 'healthcare', heading: 'Healthcare Revenue Cycle' },
];

/** Videos in display order within each section. */
export const demos: Demo[] = [
  {
    slug: 'store-cash-tie-out',
    title: 'Store Cash Tie-Out',
    audience: 'For controllers of multi-unit operators',
    description:
      "Every store's card, cash and delivery dollars tied out each morning. Each gap is traced to its cause, and a person approves the dispute list.",
    durationSeconds: 146.2,
    category: 'finance',
    uploadDate: '2026-10-30',
  },
  {
    slug: 'multi-entity-pl-consolidation',
    title: 'Multi-Entity P&L Consolidation',
    audience: 'For CFOs and controllers of multi-entity groups',
    description:
      "Every company's books consolidated into one P&L each month. Accounts map to one layout, intercompany fees are eliminated, and a person approves the result.",
    durationSeconds: 156.4,
    category: 'finance',
    uploadDate: '2026-11-02',
  },
  {
    slug: 'multi-entity-month-end-close',
    title: 'Multi-Entity Month-End Close',
    audience: 'For CFOs and controllers of multi-entity groups',
    description:
      "A group's month-end close, in order: fees posted on both sides, intercompany balances reconciled, the P&L consolidated, and lender packages built.",
    durationSeconds: 148.4,
    category: 'finance',
    uploadDate: '2026-11-02',
  },
  {
    slug: 'denial-and-delay-trace',
    title: 'Denial Root Cause Analysis',
    audience: 'For revenue cycle leaders',
    description:
      'Every denied or late-paid claim traced to the step that caused it, with the dollars and days totaled by step, community and payer.',
    durationSeconds: 155.5,
    category: 'healthcare',
    uploadDate: '2026-10-30',
  },
  {
    slug: 'pre-billing-triple-check',
    title: 'Pre-Billing Triple Check',
    audience: 'For revenue cycle and MDS teams',
    description:
      'Claims that would deny are held before billing, and each hold goes to the department that owns the fix.',
    durationSeconds: 193.7,
    category: 'healthcare',
    uploadDate: '2026-10-30',
  },
  {
    slug: 'denial-work-packets',
    title: 'Denial Appeal Packets',
    audience: 'For denial and appeals specialists',
    description:
      'A morning queue of open denials, highest priority first, and an appeal packet the specialist reviews and approves.',
    durationSeconds: 205.8,
    category: 'healthcare',
    uploadDate: '2026-10-30',
  },
];

/** Whole seconds, rounded, so the label and the ISO duration always agree. */
function wholeSeconds(seconds: number): number {
  return Math.round(seconds);
}

/** Player label, e.g. 135.9 -> "2:16". */
export function formatDuration(seconds: number): string {
  const total = wholeSeconds(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** ISO 8601 duration for schema.org, e.g. 135.9 -> "PT2M16S". */
export function isoDuration(seconds: number): string {
  const total = wholeSeconds(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `PT${m > 0 ? `${m}M` : ''}${s}S`;
}

export const demoVideoSrc = (slug: string): string => `/demos/${slug}.mp4`;
export const demoPosterSrc = (slug: string): string => `/demos/${slug}.jpg`;
export const demoPagePath = (slug: string): string => `/demos/${slug}/`;
