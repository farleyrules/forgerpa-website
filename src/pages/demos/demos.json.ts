/**
 * /demos/demos.json: the demo video catalog, built from src/data/demos.ts.
 *
 * The sales cockpit (forgerpa-sales lib/demo-links/catalog.server.ts) reads it for its Share a
 * Demo list, so the videos it can link to never drift from the videos on this site. Prerendered
 * at build time like every page (output: 'static'); adding a video to src/data/demos.ts adds it
 * here with no change to this file. The shape is { version, videos: [{ slug, title, ... }] };
 * the cockpit needs slug, title and durationSeconds and ignores the rest.
 */
import type { APIRoute } from 'astro';
import { demos, demoPagePath } from '../../data/demos';

const SITE = 'https://forgerpa.com';

export const GET: APIRoute = () => {
  const body = {
    version: 1,
    videos: demos.map((demo) => ({
      slug: demo.slug,
      title: demo.title,
      audience: demo.audience,
      category: demo.category,
      durationSeconds: demo.durationSeconds,
      uploadDate: demo.uploadDate,
      url: `${SITE}${demoPagePath(demo.slug)}`,
    })),
  };
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
