/**
 * The /demos/<slug>/ video pages: start-at links, the play button, fullscreen,
 * the end card, Replay, Copy Link, Up Next, link-preview tags and layout.
 *
 * Run against the built site (see playwright.demos.config.ts):
 *   npm run build && npx playwright test -c playwright.demos.config.ts
 *
 * Expectations come from src/data/demos.ts and the rules the pages implement
 * (same section first in Up Next, start-at parsing, the canonical URL), never
 * from the current list of videos, so adding a video needs no change here.
 * Analytics requests are blocked so a test run never records a page view.
 */
import { test, expect, type Page } from "@playwright/test";
import { demos, formatDuration, type Demo } from "../src/data/demos";

const SITE = "https://forgerpa.com";
const pagePath = (slug: string) => `/demos/${slug}/`;

/** The other videos, same section first, then the rest in list order. */
function expectedUpNext(demo: Demo): Demo[] {
  const others = demos.filter((d) => d.slug !== demo.slug);
  return [
    ...others.filter((d) => d.category === demo.category),
    ...others.filter((d) => d.category !== demo.category),
  ];
}

test.beforeEach(async ({ page }) => {
  await page.route(/googletagmanager\.com|google-analytics\.com|doubleclick\.net|googleadservices\.com/, (route) =>
    route.abort(),
  );
});

/** Skip (not fail) in a browser that cannot decode the H.264 demo videos. */
async function requireH264(page: Page) {
  const support = await page.evaluate(() =>
    document.createElement("video").canPlayType('video/mp4; codecs="avc1.640028"'),
  );
  test.skip(support === "", "this browser cannot play H.264; run with channel msedge or chrome");
}

const player = (page: Page) => page.locator("video[data-demo-player]");

/** Press the play button, wait until the video is playing, return currentTime. */
async function pressPlay(page: Page, demo: Demo): Promise<number> {
  await page.getByRole("button", { name: `Play ${demo.title}`, exact: true }).click();
  await page.waitForFunction(() => {
    const v = document.querySelector<HTMLVideoElement>("video[data-demo-player]");
    return !!v && v.readyState >= 2 && !v.seeking && !v.paused && v.currentTime > 0;
  });
  return player(page).evaluate((v: HTMLVideoElement) => v.currentTime);
}

/** Jump to half a second before the end and play (muted) so `ended` fires. */
async function playToEnd(page: Page) {
  await player(page).evaluate(async (v: HTMLVideoElement) => {
    v.muted = true;
    v.pause();
    const seeked = new Promise((resolve) => v.addEventListener("seeked", resolve, { once: true }));
    v.currentTime = v.duration - 0.5;
    await seeked;
    await v.play();
  });
}

for (const demo of demos) {
  const path = pagePath(demo.slug);

  test.describe(`${demo.title} page`, () => {
    for (const [query, expected] of [
      ["?t=45", 45],
      ["?t=1m30s", 90],
      ["?t=90s", 90],
      ["#t=45", 45],
      ["?t=junk", 0],
      ["?t=-5", 0],
    ] as const) {
      test(`start-at ${query} plays from ${expected} s`, async ({ page }) => {
        await page.goto(path + query);
        await requireH264(page);
        const startedAt = await pressPlay(page, demo);
        expect(Math.abs(startedAt - expected)).toBeLessThanOrEqual(1);
      });
    }

    test("play button swaps in native controls and playback; fullscreen enters and exits", async ({ page }) => {
      await page.goto(path);
      await requireH264(page);
      const video = player(page);
      await expect(video).not.toHaveAttribute("controls");
      await pressPlay(page, demo);
      await expect(video).toHaveAttribute("controls", "");
      await expect(page.getByRole("button", { name: `Play ${demo.title}`, exact: true })).toHaveCount(0);

      // requestFullscreen needs a real user gesture, so a probe button makes the call.
      await page.evaluate(() => {
        const b = document.createElement("button");
        b.id = "fullscreen-probe";
        b.textContent = "Fullscreen probe";
        b.style.cssText = "position:fixed;bottom:0;left:0;z-index:99999";
        b.onclick = () => document.querySelector("video[data-demo-player]")!.requestFullscreen();
        document.body.appendChild(b);
      });
      await page.click("#fullscreen-probe");
      await page.waitForFunction(() => document.fullscreenElement?.matches("video[data-demo-player]") === true);
      await page.evaluate(() => document.exitFullscreen());
      await page.waitForFunction(() => document.fullscreenElement === null);

      // Ending while fullscreen leaves fullscreen and shows the end card on the page.
      await page.click("#fullscreen-probe");
      await page.waitForFunction(() => document.fullscreenElement?.matches("video[data-demo-player]") === true);
      await playToEnd(page);
      await expect(page.locator("[data-demo-endcard]")).toBeVisible({ timeout: 10_000 });
      await page.waitForFunction(() => document.fullscreenElement === null);
    });

    test("end card on ended: Up Next tiles, keyboard reach, Replay, links", async ({ page }) => {
      await page.goto(path);
      await requireH264(page);
      const card = page.locator("[data-demo-endcard]");
      await expect(card).toBeHidden();
      await pressPlay(page, demo);
      await playToEnd(page);
      await expect(card).toBeVisible({ timeout: 10_000 });
      await expect(card.getByRole("heading", { name: "Up Next", exact: true })).toBeVisible();

      const tiles = expectedUpNext(demo).slice(0, 3);
      const links = card.locator("a[data-demo-endcard-link]");
      await expect(links).toHaveCount(tiles.length);
      for (const [i, next] of tiles.entries()) {
        await expect(links.nth(i)).toHaveAttribute("href", pagePath(next.slug));
        await expect(links.nth(i)).toHaveText(next.title);
      }

      // Focus moves into the card; Tab reaches Replay, then the first tile.
      const replay = card.getByRole("button", { name: "Replay", exact: true });
      await page.keyboard.press("Tab");
      await expect(replay).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(links.first()).toBeFocused();

      await replay.click();
      await expect(card).toBeHidden();
      await page.waitForFunction(() => {
        const v = document.querySelector<HTMLVideoElement>("video[data-demo-player]")!;
        return !v.paused && !v.seeking && v.currentTime > 0;
      });
      const afterReplay = await player(page).evaluate((v: HTMLVideoElement) => v.currentTime);
      expect(afterReplay).toBeLessThan(1.5);

      await playToEnd(page);
      await expect(card).toBeVisible({ timeout: 10_000 });
      const response = page.waitForResponse((r) => r.url().endsWith(pagePath(tiles[0].slug)));
      await links.first().click();
      expect((await response).status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${pagePath(tiles[0].slug)}$`));
      await expect(page.locator("h1")).toHaveText(tiles[0].title);
    });

    test("Copy Link copies the page URL, then a start-at link once paused", async ({ page, context, baseURL }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
      await page.goto(path);
      await requireH264(page);
      const copy = page.locator("[data-demo-copy]");
      await expect(copy).toHaveText("Copy Link");
      await copy.click();
      await expect(copy).toHaveText("Copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${SITE}${path}`);

      await pressPlay(page, demo);
      await player(page).evaluate(async (v: HTMLVideoElement) => {
        v.pause();
        const seeked = new Promise((resolve) => v.addEventListener("seeked", resolve, { once: true }));
        v.currentTime = 45.4;
        await seeked;
      });
      await expect(copy).toHaveText("Copy Link at 0:45", { timeout: 5_000 });
      await copy.click();
      await expect(copy).toHaveText("Copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${SITE}${path}?t=45`);
    });

    test("Up Next row: same section first, poster, title, duration, working links", async ({ page }) => {
      await page.goto(path);
      const expected = expectedUpNext(demo);
      const items = page.locator("[data-demo-upnext] a");
      await expect(items).toHaveCount(expected.length);
      for (const [i, next] of expected.entries()) {
        const item = items.nth(i);
        await expect(item).toHaveAttribute("href", pagePath(next.slug));
        await expect(item.locator("h3")).toHaveText(next.title);
        await expect(item.locator("time")).toHaveText(formatDuration(next.durationSeconds));
        await expect(item.locator("img")).toHaveAttribute("src", `/demos/${next.slug}.jpg`);
      }
      await items.first().click();
      await expect(page).toHaveURL(new RegExp(`${pagePath(expected[0].slug)}$`));
      await expect(page.locator("h1")).toHaveText(expected[0].title);
    });

    test("title, description, canonical and link-preview tags", async ({ page }) => {
      await page.goto(path);
      const meta = (selector: string) => page.locator(selector).getAttribute("content");
      await expect(page).toHaveTitle(`${demo.title} | Forge RPA`);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(demo.title);
      expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(`${SITE}${path}`);
      const description = await meta('meta[name="description"]');
      if (demo.description.length <= 160) {
        expect(description).toBe(demo.description);
      } else {
        // Cut at a whole word and closed with three ASCII periods.
        expect(description!.endsWith("...")).toBe(true);
        expect(demo.description.startsWith(`${description!.slice(0, -3)} `)).toBe(true);
      }
      expect(description!.length).toBeLessThanOrEqual(160);
      expect(await meta('meta[property="og:type"]')).toBe("video.other");
      expect(await meta('meta[property="og:title"]')).toBe(`${demo.title} | Forge RPA`);
      expect(await meta('meta[property="og:description"]')).toBe(description);
      expect(await meta('meta[property="og:url"]')).toBe(`${SITE}${path}`);
      expect(await meta('meta[property="og:image"]')).toBe(`${SITE}/demos/${demo.slug}.jpg`);
      expect(await meta('meta[property="og:video"]')).toBe(`${SITE}/demos/${demo.slug}.mp4`);
      expect(await meta('meta[property="og:video:secure_url"]')).toBe(`${SITE}/demos/${demo.slug}.mp4`);
      expect(await meta('meta[property="og:video:type"]')).toBe("video/mp4");
      expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");

      // The size tags must match the real files, measured here by the browser.
      const poster = await page.evaluate(async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        return [img.naturalWidth, img.naturalHeight];
      }, `/demos/${demo.slug}.jpg`);
      expect([Number(await meta('meta[property="og:image:width"]')), Number(await meta('meta[property="og:image:height"]'))]).toEqual(poster);
      await requireH264(page);
      const frame = await player(page).evaluate(async (v: HTMLVideoElement) => {
        v.preload = "metadata";
        if (v.readyState < 1) {
          const ready = new Promise((resolve) => v.addEventListener("loadedmetadata", resolve, { once: true }));
          v.load();
          await ready;
        }
        return [v.videoWidth, v.videoHeight];
      });
      expect([Number(await meta('meta[property="og:video:width"]')), Number(await meta('meta[property="og:video:height"]'))]).toEqual(frame);
    });
  });
}

test("/demos/ card titles link to their video pages", async ({ page }) => {
  await page.goto("/demos/");
  for (const demo of demos) {
    const link = page.getByRole("link", { name: demo.title, exact: true });
    await expect(link).toHaveAttribute("href", pagePath(demo.slug));
  }
  await page.getByRole("link", { name: demos[0].title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${pagePath(demos[0].slug)}$`));
  await expect(page.locator("h1")).toHaveText(demos[0].title);
  await page.getByRole("link", { name: "All Demos", exact: true }).click();
  await expect(page).toHaveURL(/\/demos\/$/);
});

for (const width of [375, 768, 1024, 1440]) {
  test(`layout at ${width}px: no horizontal scroll, nav on one row, end card fits`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const shots = process.env.DEMO_SHOTS_DIR;
    for (const path of ["/demos/", pagePath(demos[0].slug)]) {
      await page.goto(path);
      // Load the lazy posters so screenshots show them.
      await page.evaluate(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 300));
        window.scrollTo(0, 0);
        await Promise.all(
          Array.from(document.images)
            .filter((img) => !img.closest("[hidden]"))
            .map((img) => (img.complete ? null : img.decode().catch(() => null))),
        );
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);

      if (width >= 1024) {
        // The desktop nav row (gap-0 xl:gap-1) holds every link on one line inside the header.
        // "Contact Us" once overflowed into the right padding at 1024px.
        const row = await page.locator("header nav").evaluate((nav) => {
          const desktop = nav.querySelector(":scope > div > div.hidden")!;
          const items = Array.from(desktop.children).map((e) => e.getBoundingClientRect());
          const contentRight = nav.getBoundingClientRect().right - parseFloat(getComputedStyle(nav).paddingRight);
          const centers = items.map((r) => r.top + r.height / 2);
          return {
            count: items.length,
            centerSpread: Math.max(...centers) - Math.min(...centers),
            tallest: Math.max(...items.map((r) => r.height)),
            overhang: Math.max(...items.map((r) => r.right)) - contentRight,
          };
        });
        expect(row.count).toBeGreaterThan(3);
        expect(row.centerSpread).toBeLessThanOrEqual(2);
        expect(row.tallest).toBeLessThan(48);
        expect(row.overhang).toBeLessThanOrEqual(0.5);
      }

      if (shots) {
        const name = path === "/demos/" ? "demos-index" : `video-page-${demos[0].slug}`;
        await page.screenshot({ path: `${shots}/${name}-${width}.png`, fullPage: true });
      }
    }

    // The end card, reached by really playing to the end, fits inside the player at this width.
    await requireH264(page);
    await pressPlay(page, demos[0]);
    await playToEnd(page);
    const card = page.locator("[data-demo-endcard]");
    await expect(card).toBeVisible({ timeout: 10_000 });
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll<HTMLImageElement>("[data-demo-endcard] img"))
        .filter((img) => img.getClientRects().length > 0) // the third tile is display:none on a phone
        .every((img) => img.complete && img.naturalWidth > 0),
    );
    const fits = await card.evaluate((el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth);
    expect(fits, `end card overflows the player at ${width}px`).toBe(true);
    const visibleTiles = await card.locator("li").evaluateAll(
      (els) => els.filter((el) => getComputedStyle(el).display !== "none").length,
    );
    expect(visibleTiles).toBe(Math.min(width < 768 ? 2 : 3, demos.length - 1));
    if (shots && (width === 375 || width === 1440)) {
      await card.screenshot({ path: `${shots}/end-card-${width}.png` });
    }
  });
}
