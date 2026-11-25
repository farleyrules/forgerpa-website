import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Pages built but kept out of the sitemap. /demos/watch/ plays a video made for one prospect,
// reached only from a personal link (src/pages/demos/watch.astro); it is also noindex.
const SITEMAP_EXCLUDED_PATHS = new Set(['/demos/watch/']);

export default defineConfig({
  site: 'https://forgerpa.com',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    sitemap({
      filter: (page) => !SITEMAP_EXCLUDED_PATHS.has(new URL(page).pathname),
    }),
  ],
});
