import { defineCollection, z } from 'astro:content';

// Frontmatter dates may be authored as a quoted string ("2026-06-29") or as a
// bare YAML date (2026-06-29), which the YAML parser hands back as a Date.
// Normalize both to a single ISO "YYYY-MM-DD" string so every consumer (blog
// cards, layouts, RSS feed, JSON-LD) works with one consistent type instead of
// a `string | Date` union that has to be re-narrowed at each call site.
const isoDate = z
  .string()
  .or(z.date())
  .transform((value) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : value,
  );

const caseStudyCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    // Optional SEO overrides. When set, they drive only the <title> and meta
    // description; the visible on-page title and summary stay as `title` and
    // `summary`. Used to keep search-result titles/descriptions within length
    // without rewriting the visible case-study headline or summary.
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    industry: z.string(),
    service: z.string(),
    summary: z.string(),
    metric: z.string().optional(),           // Bold headline shown on homepage cards
    shortDescription: z.string().optional(), // Supporting text on homepage cards
    challenge: z.string(),
    approach: z.string(),
    outcome: z.array(z.string()),
    order: z.number().optional().default(999), // Lower number = higher priority (shown first)
    publishDate: isoDate.optional(),
    tags: z.array(z.string()).optional().default([]),
    featured: z.boolean().optional().default(false),
  }),
});

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    // Optional SEO override for the <title> only. When set, the visible post
    // <h1> and the JSON-LD headline stay as `title`; only the browser/search
    // title uses this shorter form. Keeps long headlines out of search results.
    metaTitle: z.string().optional(),
    description: z.string().optional(),
    date: isoDate.optional(),
    // Last-substantive-update date. Drives JSON-LD dateModified; falls back to `date` when unset.
    updated: isoDate.optional(),
    readingTime: z.string().optional(),
    publishDate: isoDate.optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).optional().default([]),
    // Optional slug echo written by the content-engine generator. Astro derives
    // the real route slug from the filename; this is informational only.
    slug: z.string().optional(),
    // Draft flag. The weekly content-engine writes anchor-post skeletons as
    // drafts; a draft is excluded from the blog listing and produces no route
    // until the prose is written and this is flipped to false.
    draft: z.boolean().optional().default(false),
  }),
});

export const collections = {
  'case-studies': caseStudyCollection,
  'blog': blogCollection,
};
