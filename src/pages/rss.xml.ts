import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  // Exclude drafts from the feed (the content-engine writes anchor skeletons as
  // drafts until their prose is written).
  const posts = (await getCollection('blog')).filter((post) => !post.data.draft);

  return rss({
    title: 'Forge RPA Blog',
    description: 'Automation insights from practitioners who code',
    site: context.site!,
    items: posts.map((post) => {
      // Posts date themselves via the `date` frontmatter field; `publishDate`
      // is a legacy alias no current post uses.
      const published = post.data.date ?? post.data.publishDate;
      return {
        title: post.data.title,
        pubDate: published ? new Date(published) : new Date(2025, 0, 1),
        description: post.data.description || 'Automation insights from Forge RPA',
        link: `/blog/${post.slug}/`,
      };
    }),
  });
}
