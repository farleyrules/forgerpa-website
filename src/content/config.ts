import { defineCollection, z } from 'astro:content';

const caseStudyCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    industry: z.string(),
    service: z.string(),
    summary: z.string(),
    metric: z.string().optional(),           // Bold headline shown on homepage cards
    shortDescription: z.string().optional(), // Supporting text on homepage cards
    challenge: z.string(),
    approach: z.string(),
    outcome: z.array(z.string()),
    order: z.number().optional().default(999), // Lower number = higher priority (shown first)
    publishDate: z.string().or(z.date()).optional(),
    tags: z.array(z.string()).optional().default([]),
    featured: z.boolean().optional().default(false),
  }),
});

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.string().or(z.date()).optional(),
    // Last-substantive-update date. Drives JSON-LD dateModified; falls back to `date` when unset.
    updated: z.string().or(z.date()).optional(),
    readingTime: z.string().optional(),
    publishDate: z.string().or(z.date()).optional(),
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
