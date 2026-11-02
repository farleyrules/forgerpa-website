/**
 * PROD-SAFE verification: the discovery qualifier captures the Google Click ID
 * and forwards it in the lead submission, WITHOUT ever creating a real lead.
 *
 * Funnel step under test (frontend half):
 *   src/lib/qualifier-state.ts: captureAttribution() reads ?gclid and persists
 *     it to localStorage ("forge-discovery-attribution").
 *   src/lib/qualifier-init.ts: submitInquiry() (the primary "Send Your Request"
 *     form) and submitWizard() (the 6-step "Add More Details" wizard) both read
 *     it back into the POST body's `attribution.gclid`, then POST to
 *     https://sales.forgerpa.com/api/warm-intake/discovery-qualifier.
 *
 * SAFETY (every external write is intercepted; nothing reaches production):
 *   1. Every cross-origin POST to .../discovery-qualifier is ROUTED. The body is
 *      captured, then the request is ABORTED, or (only to reach the wizard that
 *      appears after a successful inquiry) answered with a synthetic success
 *      that Playwright fulfills locally. No request reaches the real server, so
 *      no lead row is ever created.
 *   2. The Turnstile site-key fetch to sales.forgerpa.com is fulfilled with a
 *      synthetic stub, so no live cockpit call is made.
 *   3. window.turnstile is stubbed via addInitScript so the spam-check
 *      "passes" locally with a synthetic token and the real Cloudflare script
 *      is never loaded. This lets submit reach the intercepted POST.
 *   4. A catch-all route blocks ANY other request to sales.forgerpa.com,
 *      Google, Cal.com, or Cloudflare challenges, as belt-and-suspenders.
 *   5. The gclid marker is the obviously-synthetic "SYNTH-TEST-DoNotUpload".
 *
 * The page is served by a LOCAL `astro preview` server (see playwright.config.ts
 * webServer), so the run is deterministic and offline.
 *
 * The tests land on /contact. /book was folded into /contact in #42 and is now
 * only a Cloudflare Pages 301 (public/_redirects) that carries the query string
 * through. `astro preview` does not apply _redirects, so /book is a 404 here and
 * the capture script never loads; the live /book redirect is checked against
 * forgerpa.com, not in this offline run.
 */
import { test, expect, type Page, type Route } from "@playwright/test";

const SYNTH_GCLID = "SYNTH-TEST-DoNotUpload";
const ATTRIBUTION_KEY = "forge-discovery-attribution";
const QUALIFIER_ENDPOINT =
  "https://sales.forgerpa.com/api/warm-intake/discovery-qualifier";

// gbraid/wbraid mirror a real Google Ads landing from iOS. They are captured
// and forwarded beside gclid (the cockpit uploads whichever Google ranks
// highest: gclid, then wbraid, then gbraid).
const SYNTH_GBRAID = "SYNTH-GBRAID";
const SYNTH_WBRAID = "SYNTH-WBRAID";
const LANDING_URL =
  "/contact?gclid=" +
  SYNTH_GCLID +
  `&gbraid=${SYNTH_GBRAID}&wbraid=${SYNTH_WBRAID}` +
  "&utm_source=google&utm_medium=cpc&utm_campaign=erp-migration-services";

// An iOS click can arrive with ONLY a wbraid: no gclid and no UTM tags.
const WBRAID_ONLY_URL = `/contact?wbraid=${SYNTH_WBRAID}`;

type ClickIds = { gclid?: string; gbraid?: string; wbraid?: string };
type QualifierPayload = {
  source?: string;
  essentials?: boolean;
  attribution?: ClickIds & { utmCampaign?: string };
  qualifierAnswers?: { role?: string };
};

/**
 * Stub Turnstile and install the safety routes. `onQualifierPost` decides what
 * happens to each intercepted qualifier POST (abort, or a synthetic success);
 * the request never leaves the browser either way. Returns the captured bodies.
 */
async function installSafetyNet(
  page: Page,
  onQualifierPost: (route: Route, index: number) => Promise<void>,
): Promise<QualifierPayload[]> {
  // ---- Stub Turnstile BEFORE any page script runs ----
  // render() immediately invokes the success callback with a synthetic token,
  // so the submit handlers see a valid token and proceed to the POST. The real
  // challenges.cloudflare.com script is never loaded. The stub also flips
  // __turnstileTokenSet when the callback fires so the test can wait for the
  // token deterministically (the mount is async: site-key fetch, then render).
  await page.addInitScript(() => {
    (window as unknown as { __turnstileTokenSet?: boolean }).__turnstileTokenSet =
      false;
    (
      window as unknown as { turnstile?: unknown }
    ).turnstile = {
      render: (
        _selector: string,
        opts: { callback?: (token: string) => void },
      ) => {
        opts.callback?.("SYNTH-TURNSTILE-TOKEN");
        (
          window as unknown as { __turnstileTokenSet?: boolean }
        ).__turnstileTokenSet = true;
        return "synthetic-widget-id";
      },
      reset: () => {},
      getResponse: () => "SYNTH-TURNSTILE-TOKEN",
    };
  });

  // IMPORTANT: Playwright matches routes in REVERSE registration order (the
  // most recently registered handler wins). Register the broad catch-all FIRST
  // so the two specific handlers below take precedence over it. If the
  // catch-all were registered last it would swallow the site-key fetch and the
  // qualifier POST, breaking the flow.

  // ---- Belt-and-suspenders: block any other external write/call ----
  await page.route(
    /https:\/\/(sales\.forgerpa\.com|.*\.googleads\.com|.*\.google-analytics\.com|googleads\.g\.doubleclick\.net|app\.cal\.com|challenges\.cloudflare\.com)\//,
    (route: Route) => route.abort(),
  );

  // ---- Fulfill the Turnstile site-key fetch with a synthetic key ----
  await page.route("**/api/turnstile-site-key", (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ siteKey: "synthetic-site-key" }),
    }),
  );

  // ---- THE safety boundary: capture every lead POST, never forward it ----
  const captured: QualifierPayload[] = [];
  await page.route(QUALIFIER_ENDPOINT, async (route: Route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.abort();
    try {
      captured.push(req.postDataJSON() as QualifierPayload);
    } catch {
      captured.push({ source: `__unparseable: ${req.postData() ?? ""}` });
    }
    await onQualifierPost(route, captured.length - 1);
  });

  return captured;
}

/** Load a landing URL and return the persisted attribution params (or null). */
async function landAndReadStored(page: Page, url: string): Promise<ClickIds | null> {
  await page.goto(url);
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? ((JSON.parse(raw) as { params?: ClickIds }).params ?? {}) : null;
  }, ATTRIBUTION_KEY);
}

/** Load /contact with the synthetic click IDs and prove the record was persisted. */
async function landAndAssertPersisted(page: Page): Promise<void> {
  // (a) the click IDs are PERSISTED where qualifier-state.ts puts them (localStorage).
  const stored = await landAndReadStored(page, LANDING_URL);
  expect(stored, "attribution record should be persisted to localStorage").not.toBeNull();
  expect(stored?.gclid).toBe(SYNTH_GCLID);
  expect(stored?.gbraid).toBe(SYNTH_GBRAID);
  expect(stored?.wbraid).toBe(SYNTH_WBRAID);
}

/**
 * Fill and send the primary inquiry form (the default /contact view). Synthetic,
 * non-deliverable details; company is optional on this form.
 */
async function sendInquiry(page: Page): Promise<void> {
  await expect(page.locator("#qualifier-essentials-path")).toBeVisible();
  await page.fill("#essentials-name", "Synthetic Tester");
  await page.fill("#essentials-email", "synthetic.tester@example.com");
  await page.fill("#essentials-notes", "Synthetic e2e check. Do not contact.");
  await page.waitForFunction(
    () =>
      (window as unknown as { __turnstileTokenSet?: boolean })
        .__turnstileTokenSet === true,
  );
  await Promise.all([
    page.waitForRequest(QUALIFIER_ENDPOINT),
    page.click("#essentials-send"),
  ]);
}

test("captures gclid and forwards it in the (aborted) inquiry form submission", async ({
  page,
}) => {
  const captured = await installSafetyNet(page, (route) => route.abort());
  await landAndAssertPersisted(page);

  // The single-intent /contact page leads with the short inquiry form; its one
  // button, "Send Your Request", is how most leads arrive.
  await sendInquiry(page);

  // (b) The gclid is included in the request payload to the qualifier endpoint.
  await expect
    .poll(() => captured.length, { message: "the inquiry POST body should have been captured" })
    .toBe(1);
  const payload = captured[0];
  expect(payload.source).toBe("discovery_qualifier");
  expect(payload.essentials).toBe(true);
  expect(payload.attribution?.gclid).toBe(SYNTH_GCLID);
  expect(payload.attribution?.gbraid).toBe(SYNTH_GBRAID);
  expect(payload.attribution?.wbraid).toBe(SYNTH_WBRAID);
  // The campaign UTM also rides along (used later for conversion VALUE).
  expect(payload.attribution?.utmCampaign).toBe("erp-migration-services");
});

test("carries the click IDs into the Cal.com booking metadata", async ({ page }) => {
  // The booking calendar appears after a successful inquiry ("Book a Time" on
  // the confirmation), so the inquiry POST gets a synthetic local success. The
  // Cal.com script itself is blocked, so its loader keeps every call queued in
  // window.Cal.q, which is where the inline embed's config is read from.
  await installSafetyNet(page, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ tier: "MEDIUM" }),
    }),
  );
  await landAndAssertPersisted(page);
  await sendInquiry(page);
  await expect(page.locator("#essentials-confirmation")).toBeVisible();
  await page.click("#essentials-confirm-book");

  const readMetadata = () =>
    page.evaluate(() => {
      const cal = (window as unknown as { Cal?: { q?: ArrayLike<unknown>[] } }).Cal;
      const inline = Array.from(cal?.q ?? [])
        .map((args) => Array.from(args))
        .find((args) => args[0] === "inline");
      const opts = inline?.[1] as { config?: { metadata?: Record<string, string> } } | undefined;
      return opts?.config?.metadata ?? null;
    });
  await expect.poll(readMetadata, { message: "the Cal inline embed should be queued" }).not.toBeNull();
  expect(await readMetadata()).toEqual({
    gclid: SYNTH_GCLID,
    gbraid: SYNTH_GBRAID,
    wbraid: SYNTH_WBRAID,
  });
});

test("persists and forwards a wbraid-only iOS landing (no gclid, no UTM tags)", async ({
  page,
}) => {
  const captured = await installSafetyNet(page, (route) => route.abort());

  // Before wbraid counted as an ad parameter, this landing saved NO record.
  const stored = await landAndReadStored(page, WBRAID_ONLY_URL);
  expect(stored, "a wbraid alone should persist an attribution record").not.toBeNull();
  expect(stored?.wbraid).toBe(SYNTH_WBRAID);
  expect(stored?.gclid ?? null).toBeNull();

  await sendInquiry(page);
  await expect
    .poll(() => captured.length, { message: "the inquiry POST body should have been captured" })
    .toBe(1);
  expect(captured[0].attribution?.wbraid).toBe(SYNTH_WBRAID);
  expect(captured[0].attribution?.gclid ?? null).toBeNull();
});

test("forwards gclid in the full wizard reached via Add More Details (aborted)", async ({
  page,
}) => {
  // The 6-step wizard appears only AFTER a successful inquiry, on the
  // confirmation screen. So the FIRST POST (the inquiry) gets a synthetic
  // success that Playwright fulfills locally (it never reaches the server), and
  // the SECOND POST (the wizard) is captured and aborted.
  const captured = await installSafetyNet(page, (route, index) =>
    index === 0
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ tier: "MEDIUM" }),
        })
      : route.abort(),
  );
  await landAndAssertPersisted(page);
  await sendInquiry(page);

  // ---- Open the full wizard from the post-submit confirmation ----
  await expect(page.locator("#essentials-confirmation")).toBeVisible();
  await page.click("#essentials-confirm-tellmore");

  // ---- Walk the 6-step wizard to the submit step ----
  // Step 1: role
  await page.check('input[name="qualifier-role"][value="Controller"]');
  await page.click("#qualifier-step1-next");
  // Step 2: challenge
  await page.check('input[name="qualifier-challenge"][value="Month-end close"]');
  await page.click("#qualifier-step2-next");
  // Step 3: systems (multi-select)
  await page.check('input[name="qualifier-systems"][value="Excel/Power Query"]');
  await page.click("#qualifier-step3-next");
  // Step 4: team size
  await page.check('input[name="qualifier-team-size"][value="6-15"]');
  await page.click("#qualifier-step4-next");
  // Step 5: timeline. Step 6 mounts its OWN Turnstile widget, so reset the
  // stub's flag first and wait for that second callback below.
  await page.check('input[name="qualifier-timeline"][value="This quarter"]');
  await page.evaluate(() => {
    (window as unknown as { __turnstileTokenSet?: boolean }).__turnstileTokenSet =
      false;
  });
  await page.click("#qualifier-step5-next");

  // Step 6: contact. Name + email carry over from the inquiry; company is
  // required here. Consent is passive (no checkbox gate).
  await expect(page.locator('[data-qualifier-step="6"]')).toBeVisible();
  await expect(page.locator("#qualifier-contact-email")).toHaveValue(
    "synthetic.tester@example.com",
  );
  await page.fill("#qualifier-contact-company", "Synthetic Co");
  await page.waitForFunction(
    () =>
      (window as unknown as { __turnstileTokenSet?: boolean })
        .__turnstileTokenSet === true,
  );

  // Submit. The POST is intercepted + aborted.
  await Promise.all([
    page.waitForRequest(QUALIFIER_ENDPOINT),
    page.click("#qualifier-step6-submit"),
  ]);

  // (b) The wizard POST also carries the gclid, alongside the answers.
  await expect
    .poll(() => captured.length, { message: "both POST bodies should have been captured" })
    .toBe(2);
  const payload = captured[1];
  expect(payload.source).toBe("discovery_qualifier");
  expect(payload.essentials).toBeUndefined();
  expect(payload.attribution?.gclid).toBe(SYNTH_GCLID);
  expect(payload.attribution?.wbraid).toBe(SYNTH_WBRAID);
  expect(payload.attribution?.utmCampaign).toBe("erp-migration-services");
  expect(payload.qualifierAnswers?.role).toBe("Controller");
});
