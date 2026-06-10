import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for forgerpa-website end-to-end tests.
 *
 * Today this covers ONE prod-safety-critical flow: the discovery qualifier
 * captures the Google Click ID and includes it in the lead submission. The
 * test never lets that submission reach the real cockpit (it intercepts and
 * aborts the cross-origin POST), so running it creates NO lead.
 *
 * The webServer block builds the site and serves it with `astro preview`
 * (a static server) so the run is deterministic and self-contained — no live
 * forgerpa.com dependency, and no dev-mode HMR reloads that would race a
 * multi-step wizard walk while other files in the repo are being edited.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4321/book",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
