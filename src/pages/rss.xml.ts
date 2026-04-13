import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('blog');
  
  return rss({
    title: 'Forge RPA Blog',
    description: 'Automation insights from practitioners who code',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.publishDate 
        ? new Date(post.data.publishDate) 
        : new Date(2025, 0, 1), // Fallback date
      description: post.data.description || 'Automation insights from Forge RPA',
      link: `/blog/${post.slug}/`,
    })),
  });
}
