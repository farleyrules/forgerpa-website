import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the demo video pages (e2e/demo-pages.spec.ts).
 *
 * Kept apart from playwright.config.ts, whose webServer still waits on the
 * retired /book page. This one serves the ALREADY BUILT dist/ with
 * `astro preview` on its own port and stops that server when the run ends:
 *
 *   npm run build
 *   npx playwright test -c playwright.demos.config.ts
 *
 * The demo videos are H.264, which Playwright's bundled Chromium cannot decode,
 * so the run uses the installed Microsoft Edge (channel "msedge"). The spec
 * skips itself in a browser that cannot play H.264 rather than failing on it.
 *
 * Set DEMO_SHOTS_DIR to save the 375px and 1440px screenshots there.
 */
const PORT = 4329;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "demo-pages.spec.ts",
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
