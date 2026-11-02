/**
 * Tracked demo link beacons on the /demos/<slug>/ pages (src/components/DemoTracking.astro).
 *
 * Run against the built site (see playwright.demo-tracking.config.ts):
 *   npm run build && npx playwright test -c playwright.demo-tracking.config.ts
 *
 * Every request to the cockpit's ingest is caught by page.route and answered 204 here, so a
 * run records nothing anywhere. Analytics requests are blocked. Expectations come from
 * src/data/demos.ts and the event contract (forgerpa-sales lib/demo-links/events.ts), never
 * from the current list of videos.
 */
import { test, expect, type Page } from "@playwright/test";
import { demos } from "../src/data/demos";
import { DEMO_EVENTS_URL } from "../src/data/demo-tracking";

const demo = demos[0]!;
const pagePath = `/demos/${demo.slug}/`;
const TOKEN = "AbCdEf1234";
const CONTRACT_KEYS = new Set(["v", "r", "s", "e", "slug", "n", "w", "p", "d", "x"]);

interface Beacon {
  body: Record<string, unknown>;
  contentType: string;
}

async function captureBeacons(page: Page): Promise<Beacon[]> {
  const beacons: Beacon[] = [];
  await page.route(/googletagmanager\.com|google-analytics\.com|doubleclick\.net|googleadservices\.com/, (route) =>
    route.abort(),
  );
  await page.route(DEMO_EVENTS_URL, async (route) => {
    const request = route.request();
    beacons.push({
      body: JSON.parse(request.postData() ?? "{}"),
      contentType: (await request.allHeaders())["content-type"] ?? "",
    });
    await route.fulfill({ status: 204, body: "" });
  });
  return beacons;
}

/** Skip (not fail) in a browser that cannot decode the H.264 demo videos. */
async function requireH264(page: Page) {
  const support = await page.evaluate(() =>
    document.createElement("video").canPlayType('video/mp4; codecs="avc1.640028"'),
  );
  test.skip(support === "", "this browser cannot play H.264; run with channel msedge or chrome");
}

async function pressPlay(page: Page) {
  await page.getByRole("button", { name: `Play ${demo.title}`, exact: true }).click();
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>("video[data-demo-player]");
    return !!v && !v.paused && v.currentTime > 0;
  });
}

const events = (beacons: Beacon[]) => beacons.map((b) => b.body.e);

test("a page without ?r= sends nothing, even past a heartbeat", async ({ page }) => {
  const beacons = await captureBeacons(page);
  await page.goto(pagePath);
  await requireH264(page);
  await pressPlay(page);
  await page.waitForTimeout(11_000);
  expect(beacons).toHaveLength(0);
});

for (const bad of ["short", "AbCdEf123!", "AbCdEf12345", "%20AbCdEf1234"]) {
  test(`a malformed ?r=${bad} sends nothing`, async ({ page }) => {
    const beacons = await captureBeacons(page);
    await page.goto(`${pagePath}?r=${bad}`);
    await requireH264(page);
    await pressPlay(page);
    await page.waitForTimeout(1500);
    expect(beacons).toHaveLength(0);
  });
}

test("a valid ?r= sends open as text/plain with only the contract's keys, then leaves the address bar", async ({ page }) => {
  const beacons = await captureBeacons(page);
  await page.goto(`${pagePath}?r=${TOKEN}&t=45`);
  await expect.poll(() => events(beacons)).toEqual(["open"]);
  const open = beacons[0]!;
  expect(open.contentType).toMatch(/^text\/plain/);
  expect(open.body).toMatchObject({ v: 1, r: TOKEN, e: "open", slug: demo.slug, n: 0, w: 0, p: 0 });
  expect(String(open.body.s)).toMatch(/^[A-Za-z0-9]{16}$/);
  expect(Number(open.body.d)).toBeGreaterThan(0);
  for (const key of Object.keys(open.body)) expect(CONTRACT_KEYS.has(key), key).toBe(true);
  // The token is gone from the address bar; the start-at stays.
  const url = new URL(page.url());
  expect(url.searchParams.get("r")).toBeNull();
  expect(url.searchParams.get("t")).toBe("45");
});

test("play, pause, Copy Link and an Up Next click are reported under one session id", async ({ page }) => {
  const beacons = await captureBeacons(page);
  await page.goto(`${pagePath}?r=${TOKEN}`);
  await requireH264(page);
  await pressPlay(page);
  await expect.poll(() => events(beacons)).toContain("play");
  await page.locator("video[data-demo-player]").evaluate((v: HTMLVideoElement) => v.pause());
  await expect.poll(() => events(beacons)).toContain("pause");
  await page.locator("[data-demo-copy]").click();
  await expect.poll(() => events(beacons)).toContain("copy_link");
  const firstTile = page.locator("[data-demo-upnext] a").first();
  const targetSlug = /\/demos\/([a-z0-9-]+)\/$/.exec((await firstTile.getAttribute("href")) ?? "")?.[1];
  await firstTile.click();
  await page.waitForURL(`**/demos/${targetSlug}/`);
  await expect.poll(() => events(beacons)).toContain("up_next_click");
  const upNext = beacons.find((b) => b.body.e === "up_next_click")!;
  expect(upNext.body.x).toBe(targetSlug);
  expect(new Set(beacons.map((b) => b.body.s)).size).toBe(1);
  const seqs = beacons.map((b) => Number(b.body.n));
  expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  // The Up Next page itself carries no token, so it adds nothing.
  await page.waitForTimeout(1000);
  expect(beacons.filter((b) => b.body.slug === targetSlug)).toHaveLength(0);
});

test("a jump made while paused is reported when the tab is hidden; seconds watched stay small", async ({ page }) => {
  const beacons = await captureBeacons(page);
  await page.goto(`${pagePath}?r=${TOKEN}`);
  await requireH264(page);
  await pressPlay(page);
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>("video[data-demo-player]");
    return !!v && v.currentTime >= 1.5;
  });
  const video = page.locator("video[data-demo-player]");
  await video.evaluate((v: HTMLVideoElement) => v.pause());
  await expect.poll(() => events(beacons)).toContain("pause");
  await video.evaluate(async (v: HTMLVideoElement) => {
    const seeked = new Promise((resolve) => v.addEventListener("seeked", resolve, { once: true }));
    v.currentTime = v.duration;
    await seeked;
  });
  const length = await video.evaluate((v: HTMLVideoElement) => v.duration);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => events(beacons).filter((e) => e === "progress").length).toBeGreaterThan(0);
  const last = beacons.at(-1)!;
  expect(last.body.e).toBe("progress");
  expect(Number(last.body.p)).toBeGreaterThanOrEqual(Math.floor(length * 10) / 10 - 0.1);
  expect(Number(last.body.w)).toBeLessThan(10);
});

// The Google tags in BaseLayout run before DemoTracking removes the code from the address bar,
// so they are configured with a page_location that never carries ?r=. The tags only render when
// the site is built with a GA4 id, so this check needs one (any value works, nothing is sent):
//   PUBLIC_GA4_MEASUREMENT_ID=G-TEST000000 npm run build && npx playwright test -c playwright.demo-tracking.config.ts
test("Google tags get the page address without the ?r= code", async ({ page }) => {
  const beacons = await captureBeacons(page);
  await page.goto(`${pagePath}?r=${TOKEN}&utm_source=check`);
  const configs = await page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
      .map((entry) => Array.from(entry))
      .filter((args) => args[0] === "config")
      .map((args) => String((args[2] as { page_location?: string } | undefined)?.page_location ?? "")),
  );
  test.skip(configs.length === 0, "built without PUBLIC_GA4_MEASUREMENT_ID; see the comment above");
  for (const location of configs) {
    const url = new URL(location);
    expect(url.pathname).toBe(pagePath);
    expect(url.searchParams.has("r")).toBe(false);
    expect(url.searchParams.get("utm_source")).toBe("check");
    expect(location).not.toContain(TOKEN);
  }
  await expect.poll(() => events(beacons)).toContain("open");
  expect(beacons[0]!.body.r).toBe(TOKEN);
});
