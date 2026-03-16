import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    author: z.string().default('David Farley'),
    date: z.string(),
    description: z.string(),
    tags: z.array(z.string()).default([]),
    readingTime: z.string().default('8 min'),
  }),
});

export const collections = { blog };
