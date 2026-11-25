import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the private demo watch page (e2e/demo-watch.spec.ts).
 *
 * Same setup as playwright.demo-tracking.config.ts, on its own port so the suites can run at
 * once: it serves the ALREADY BUILT dist/ with `astro preview` and uses the installed Microsoft
 * Edge, since Playwright's bundled Chromium cannot decode the H.264 demo videos.
 *
 *   npm run build
 *   npx playwright test -c playwright.demo-watch.config.ts
 *
 * The cockpit's lookup, its media and every beacon are caught by page.route and answered
 * locally: no request reaches the sales cockpit.
 */
const PORT = 4331;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "demo-watch.spec.ts",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "msedge",
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/demos/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
