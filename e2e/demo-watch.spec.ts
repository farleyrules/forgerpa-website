/**
 * The private demo watch page, /demos/watch/?r=<token> (src/pages/demos/watch.astro).
 *
 * Run against the built site (see playwright.demo-watch.config.ts):
 *   npm run build && npx playwright test -c playwright.demo-watch.config.ts
 *
 * The cockpit is stubbed with page.route: its lookup (DEMO_RESOLVE_URL), its media routes and
 * its beacon ingest (DEMO_EVENTS_URL) are answered here, so a run records nothing anywhere.
 * Analytics requests are blocked. The video in the stubbed answer is invented ("Example
 * Restaurant Group"); its bytes are one of the public demo encodes, served as the cockpit would.
 * Expected values come from that invented answer and the shared contract (forgerpa-sales
 * app/api/demo-links/resolve), never from what the page happens to render.
 *
 * Nothing here is skipped: a browser that cannot play H.264, or a build without the GA4 id that
 * .env.production supplies, fails instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page, type Request } from "@playwright/test";
import { demos } from "../src/data/demos";
import { DEMO_EVENTS_URL, DEMO_RESOLVE_URL } from "../src/data/demo-tracking";

const WATCH_PATH = "/demos/watch/";
const TOKEN = "AbCdEf1234";
/** The contract's media routes: https://sales.forgerpa.com/api/demo-links/media/<token>/<kind>. */
const MEDIA_BASE = "https://sales.forgerpa.com/api/demo-links/media/";
const SITE = "https://forgerpa.com";

const VIDEO = {
  version: 1,
  slug: "example-restaurant-group-cash-tie-out",
  title: "Cash Tie-Out for Example Restaurant Group",
  audience: "Built for Example Restaurant Group",
  description: "Every store's sales tied from the register to the bank, with each gap traced to its cause.",
  durationSeconds: 146.2,
  videoUrl: `${MEDIA_BASE}${TOKEN}/video`,
  posterUrl: `${MEDIA_BASE}${TOKEN}/poster`,
};
/** 146.2 s rounds to 146 s = 2 min 26 s. */
const VIDEO_CLOCK = "2:26";
const VIDEO_ISO = "PT2M26S";

/** The bytes the stubbed media routes serve: a public demo encode and its poster. */
const PUBLIC_DIR = fileURLToPath(new URL("../public/demos/", import.meta.url));
const MEDIA_FILES = {
  video: { path: join(PUBLIC_DIR, `${demos[0]!.slug}.mp4`), contentType: "video/mp4" },
  poster: { path: join(PUBLIC_DIR, `${demos[0]!.slug}.jpg`), contentType: "image/jpeg" },
};
const DIST_DIR = fileURLToPath(new URL("../dist/", import.meta.url));

// A lookup answer. (The cockpit's other-origin answer, a 200 without CORS headers, cannot be
// staged here: Edge lets a page.route answer through without them. The page treats a fetch the
// browser refuses like "abort", which is covered below.)
type Answer = { status: number; body: unknown; raw?: string } | "abort";

interface Cockpit {
  beacons: Record<string, unknown>[];
  lookups: Request[];
  media: string[];
}

/**
 * Stub the cockpit. `answers` is used in order, one per lookup; the last one repeats. The stub
 * echoes the page's Origin in Access-Control-Allow-Origin, as the cockpit does for an allowed
 * origin.
 */
async function stubCockpit(page: Page, answers: Answer[]): Promise<Cockpit> {
  const cockpit: Cockpit = { beacons: [], lookups: [], media: [] };
  await page.route(/googletagmanager\.com|google-analytics\.com|doubleclick\.net|googleadservices\.com/, (route) =>
    route.abort(),
  );
  await page.route(DEMO_EVENTS_URL, async (route) => {
    cockpit.beacons.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route(
    (url) => url.href.startsWith(DEMO_RESOLVE_URL),
    async (route) => {
      const request = route.request();
      cockpit.lookups.push(request);
      const answer = answers[Math.min(cockpit.lookups.length - 1, answers.length - 1)]!;
      if (answer === "abort") return route.abort("failed");
      const origin = (await request.allHeaders())["origin"] ?? "";
      await route.fulfill({
        status: answer.status,
        headers: { "Access-Control-Allow-Origin": origin, "Cache-Control": "no-store", Vary: "Origin" },
        contentType: "application/json",
        body: answer.raw ?? JSON.stringify(answer.body),
      });
    },
  );
  await page.route(
    (url) => url.href.startsWith(MEDIA_BASE),
    async (route) => {
      const url = route.request().url();
      cockpit.media.push(url);
      const kind = url.endsWith("/poster") ? "poster" : "video";
      await route.fulfill({ path: MEDIA_FILES[kind].path, contentType: MEDIA_FILES[kind].contentType });
    },
  );
  return cockpit;
}

const NOT_FOUND: Answer = { status: 404, body: { error: "not found" } };
const LIVE: Answer = { status: 200, body: VIDEO };

const state = (page: Page) => page.locator("[data-watch]");
const events = (cockpit: Cockpit) => cockpit.beacons.map((b) => b.e);

async function expectInactive(page: Page) {
  await expect(state(page)).toHaveAttribute("data-watch-state", "inactive");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Video Unavailable");
  await expect(page.getByText("This video link is no longer active.", { exact: true })).toBeVisible();
  const message = page.locator("[data-watch-message]");
  await expect(message.getByRole("link", { name: "Browse All Demos", exact: true })).toHaveAttribute("href", "/demos/");
  await expect(message.getByRole("link", { name: "Contact Us", exact: true })).toHaveAttribute("href", "/contact");
  await expect(page.getByRole("button", { name: "Try Again" })).toBeHidden();
  await expect(page.locator("video[data-demo-player]")).toBeHidden();
  await expect(page.locator("[data-watch-cta]")).toBeHidden();
}

async function expectError(page: Page) {
  await expect(state(page)).toHaveAttribute("data-watch-state", "error");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Video Unavailable");
  await expect(
    page.getByText("The video could not be loaded. Check your connection and try again.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try Again", exact: true })).toBeVisible();
  await expect(page.locator("video[data-demo-player]")).toBeHidden();
}

test("a live link shows the cockpit's video, keeps ?r= in the address bar and beacons with the resolved slug", async ({ page }) => {
  const cockpit = await stubCockpit(page, [LIVE]);
  await page.goto(`${WATCH_PATH}?r=${TOKEN}`);
  await expect(state(page)).toHaveAttribute("data-watch-state", "ready");

  // One lookup: a plain GET for this token, sent without cookies.
  expect(cockpit.lookups).toHaveLength(1);
  expect(cockpit.lookups[0]!.method()).toBe("GET");
  expect(cockpit.lookups[0]!.url()).toBe(`${DEMO_RESOLVE_URL}?r=${TOKEN}`);
  expect((await cockpit.lookups[0]!.allHeaders())["cookie"]).toBeUndefined();

  // The cockpit's answer, as written.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(VIDEO.title);
  await expect(page.getByText(VIDEO.audience, { exact: true })).toBeVisible();
  await expect(page.getByText(VIDEO.description, { exact: true })).toBeVisible();
  const badge = page.locator("[data-watch-duration]");
  await expect(badge).toHaveText(VIDEO_CLOCK);
  await expect(badge).toHaveAttribute("datetime", VIDEO_ISO);
  const video = page.locator("video[data-demo-player]");
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute("src", VIDEO.videoUrl);
  await expect(video).toHaveAttribute("poster", VIDEO.posterUrl);
  await expect(page.locator("[data-watch-cta]")).toBeVisible();
  // The tab title stays generic, so analytics never records a prospect's video title.
  await expect(page).toHaveTitle("Demo Video | Forge RPA");

  // One person, one link: no Copy Link, no Up Next, no end card.
  await expect(page.locator("[data-demo-copy]")).toHaveCount(0);
  await expect(page.locator("[data-demo-upnext]")).toHaveCount(0);
  await expect(page.locator("[data-demo-endcard]")).toHaveCount(0);

  // Tracking started only now, with the slug the lookup returned.
  await expect.poll(() => events(cockpit)).toEqual(["open"]);
  expect(cockpit.beacons[0]).toMatchObject({ v: 1, r: TOKEN, e: "open", slug: VIDEO.slug, n: 0 });
  expect(Number(cockpit.beacons[0]!.d)).toBeGreaterThan(0);
  // A second start does nothing.
  const restarted = await page.evaluate(
    () => (window as unknown as { forgeDemoTracking: { start: (s: string, d: number) => boolean } }).forgeDemoTracking.start("other-slug", 10),
  );
  expect(restarted).toBe(false);

  // The token stays: it is the only key to the video, so a reload must still work.
  expect(new URL(page.url()).searchParams.get("r")).toBe(TOKEN);

  // Play, through the stubbed media route.
  const h264 = await page.evaluate(() => document.createElement("video").canPlayType('video/mp4; codecs="avc1.640028"'));
  expect(h264, "this browser cannot play H.264; run with channel msedge").not.toBe("");
  await page.getByRole("button", { name: `Play ${VIDEO.title}`, exact: true }).click();
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>("video[data-demo-player]");
    return !!v && !v.paused && v.currentTime > 0;
  });
  await expect.poll(() => events(cockpit)).toContain("play");
  expect(cockpit.media).toContain(VIDEO.videoUrl);
  expect(cockpit.media).toContain(VIDEO.posterUrl);
  expect(new Set(cockpit.beacons.map((b) => b.slug))).toEqual(new Set([VIDEO.slug]));
  expect(new Set(cockpit.beacons.map((b) => b.r))).toEqual(new Set([TOKEN]));
  expect(new Set(cockpit.beacons.map((b) => b.s)).size).toBe(1);
});

test("a reload of a live link still finds the video", async ({ page }) => {
  const cockpit = await stubCockpit(page, [LIVE]);
  await page.goto(`${WATCH_PATH}?r=${TOKEN}`);
  await expect(state(page)).toHaveAttribute("data-watch-state", "ready");
  await page.reload();
  await expect(state(page)).toHaveAttribute("data-watch-state", "ready");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(VIDEO.title);
  expect(cockpit.lookups.map((r) => r.url())).toEqual([
    `${DEMO_RESOLVE_URL}?r=${TOKEN}`,
    `${DEMO_RESOLVE_URL}?r=${TOKEN}`,
  ]);
});

test("a 404 from the cockpit shows the inactive state and sends nothing", async ({ page }) => {
  const cockpit = await stubCockpit(page, [NOT_FOUND]);
  await page.goto(`${WATCH_PATH}?r=${TOKEN}`);
  await expectInactive(page);
  expect(cockpit.lookups).toHaveLength(1);
  await page.waitForTimeout(1000);
  expect(cockpit.beacons).toHaveLength(0);
  expect(cockpit.media).toHaveLength(0);
});

for (const query of ["", "?r=", "?r=short", "?r=AbCdEf123!", "?r=AbCdEf12345", "?r=%20AbCdEf1234"]) {
  test(`${query || "no ?r="} shows the inactive state without asking the cockpit`, async ({ page }) => {
    const cockpit = await stubCockpit(page, [LIVE]);
    await page.goto(`${WATCH_PATH}${query}`);
    await expectInactive(page);
    await page.waitForTimeout(1000);
    expect(cockpit.lookups).toHaveLength(0);
    expect(cockpit.beacons).toHaveLength(0);
  });
}

test("a failed lookup shows the error state, and Try Again recovers", async ({ page }) => {
  const cockpit = await stubCockpit(page, ["abort", LIVE]);
  await page.goto(`${WATCH_PATH}?r=${TOKEN}`);
  await expectError(page);
  expect(cockpit.beacons).toHaveLength(0);
  await page.getByRole("button", { name: "Try Again", exact: true }).click();
  await expect(state(page)).toHaveAttribute("data-watch-state", "ready");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(VIDEO.title);
  expect(cockpit.lookups).toHaveLength(2);
  await expect.poll(() => events(cockpit)).toEqual(["open"]);
  expect(cockpit.beacons[0]!.slug).toBe(VIDEO.slug);
});

const UNUSABLE: Array<[string, Answer]> = [
  ["a 500", { status: 500, body: { error: "server error" } }],
  ["a 429", { status: 429, body: { error: "too many requests" } }],
  ["a 200 that is not JSON", { status: 200, body: null, raw: "<html>oops</html>" }],
  ["a 200 of another version", { status: 200, body: { ...VIDEO, version: 2 } }],
  ["a 200 with a malformed slug", { status: 200, body: { ...VIDEO, slug: "Not A Slug" } }],
  ["a 200 without a title", { status: 200, body: { ...VIDEO, title: "  " } }],
  ["a 200 with a non-https video", { status: 200, body: { ...VIDEO, videoUrl: "http://sales.forgerpa.com/x" } }],
  ["a 200 without a poster", { status: 200, body: { ...VIDEO, posterUrl: undefined } }],
];
for (const [name, answer] of UNUSABLE) {
  test(`${name} shows the error state and sends nothing`, async ({ page }) => {
    const cockpit = await stubCockpit(page, [answer]);
    await page.goto(`${WATCH_PATH}?r=${TOKEN}`);
    await expectError(page);
    await page.waitForTimeout(500);
    expect(cockpit.beacons).toHaveLength(0);
    expect(cockpit.media).toHaveLength(0);
  });
}

test("the page is noindex with a strict-origin referrer policy", async ({ page }) => {
  await stubCockpit(page, [NOT_FOUND]);
  await page.goto(WATCH_PATH);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /\bnoindex\b/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "strict-origin");
});

test("leaving for another page on the site hands it no ?r=", async ({ page }) => {
  await stubCockpit(page, [LIVE]);
  await page.goto(`${WATCH_PATH}?r=${TOKEN}`);
  await expect(state(page)).toHaveAttribute("data-watch-state", "ready");
  const origin = new URL(page.url()).origin;
  await page.getByRole("link", { name: "All Demos", exact: true }).click();
  await page.waitForURL("**/demos/");
  const referrer = await page.evaluate(() => document.referrer);
  expect(referrer).toBe(`${origin}/`);
  expect(referrer).not.toContain(TOKEN);
});

// BaseLayout configures the Google tags with page_location minus ?r= on every page. Here the
// code stays in the address bar, so this is the check that keeps it out of analytics. The tags
// render only when the build has a GA4 id (.env.production supplies one); without it this FAILS.
test("Google tags get the page address without the ?r= code", async ({ page }) => {
  const cockpit = await stubCockpit(page, [LIVE]);
  await page.goto(`${WATCH_PATH}?r=${TOKEN}&utm_source=check`);
  await expect(state(page)).toHaveAttribute("data-watch-state", "ready");
  const configs = await page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
      .map((entry) => Array.from(entry))
      .filter((args) => args[0] === "config")
      .map((args) => String((args[2] as { page_location?: string } | undefined)?.page_location ?? "")),
  );
  expect(configs.length, "built without PUBLIC_GA4_MEASUREMENT_ID: no Google tag to check").toBeGreaterThan(0);
  for (const location of configs) {
    const url = new URL(location);
    expect(url.pathname).toBe(WATCH_PATH);
    expect(url.searchParams.has("r")).toBe(false);
    expect(url.searchParams.get("utm_source")).toBe("check");
    expect(location).not.toContain(TOKEN);
  }
  // The address bar keeps the code; only the analytics copy loses it.
  expect(new URL(page.url()).searchParams.get("r")).toBe(TOKEN);
  await expect.poll(() => events(cockpit)).toContain("open");
});

test("the built sitemap leaves out /demos/watch/ and keeps the public demo pages", async ({ request }) => {
  const index = await (await request.get("/sitemap-index.xml")).text();
  const sitemapPaths = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  expect(sitemapPaths.length).toBeGreaterThan(0);
  let urls: string[] = [];
  for (const path of sitemapPaths) {
    const xml = await (await request.get(path)).text();
    urls = urls.concat([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!));
  }
  // Controls: the search can find demo pages, so a miss below means the page is really absent.
  expect(urls).toContain(`${SITE}/demos/`);
  expect(urls).toContain(`${SITE}/demos/${demos[0]!.slug}/`);
  expect(urls.filter((u) => u.includes("/demos/watch"))).toEqual([]);
});

test("the demo catalog and the public list never carry the watch page", async ({ request }) => {
  // A public video slugged "watch" would collide with this page's route.
  expect(demos.map((d) => d.slug)).not.toContain("watch");
  const catalog = (await (await request.get("/demos/demos.json")).json()) as { videos: { slug: string; url: string }[] };
  expect(catalog.videos.length).toBe(demos.length);
  expect(catalog.videos.filter((v) => v.slug === "watch" || v.url.includes("/demos/watch"))).toEqual([]);
});

test("no built page links to /demos/watch/", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".html")) files.push(full);
    }
  };
  walk(DIST_DIR);
  const anchorTo = (target: RegExp) =>
    files.filter((file) =>
      [...readFileSync(file, "utf8").matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].some((m) => target.test(m[1]!)),
    );
  // Control: the same scan finds the pages that link to the demo list.
  expect(anchorTo(/^(?:https:\/\/forgerpa\.com)?\/demos\/$/).length).toBeGreaterThan(1);
  expect(anchorTo(/^(?:https:\/\/forgerpa\.com)?\/demos\/watch(?:\/|\?|#|$)/)).toEqual([]);
});
