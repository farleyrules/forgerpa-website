import { defineCollection, z } from 'astro:content';

const caseStudyCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    industry: z.string(),
    service: z.string(),
    summary: z.string(),
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
    publishDate: z.string().or(z.date()).optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).optional().default([]),
  }),
});

export const collections = {
  'case-studies': caseStudyCollection,
  'blog': blogCollection,
};
