/**
 * PROD-SAFE verification: the discovery qualifier captures the Google Click ID
 * and forwards it in the lead submission — WITHOUT ever creating a real lead.
 *
 * Funnel step under test (frontend half):
 *   src/lib/qualifier-state.ts  — captureAttribution() reads ?gclid and persists
 *                                 it to localStorage ("forge-discovery-attribution").
 *   src/lib/qualifier-init.ts   — submitWizard() reads it back and puts it in the
 *                                 POST body's `attribution.gclid`, then POSTs to
 *                                 https://sales.forgerpa.com/api/warm-intake/discovery-qualifier.
 *
 * SAFETY (every external write is intercepted; nothing reaches production):
 *   1. The cross-origin POST to .../discovery-qualifier is ROUTED and ABORTED
 *      after we capture its body. No lead row is ever created.
 *   2. The Turnstile site-key fetch to sales.forgerpa.com is fulfilled with a
 *      synthetic stub, so no live cockpit call is made.
 *   3. window.turnstile is stubbed via addInitScript so the spam-check
 *      "passes" locally with a synthetic token and the real Cloudflare script
 *      is never loaded. This lets submit reach the (aborted) POST.
 *   4. A catch-all route blocks ANY other request to sales.forgerpa.com,
 *      Google, Cal.com, or Cloudflare challenges, as belt-and-suspenders.
 *   5. The gclid marker is the obviously-synthetic "SYNTH-TEST-DoNotUpload".
 *
 * Note: the page is served by the LOCAL Astro dev server (see
 * playwright.config.ts webServer), so the run is deterministic and offline.
 */
import { test, expect, type Route } from "@playwright/test";

const SYNTH_GCLID = "SYNTH-TEST-DoNotUpload";
const ATTRIBUTION_KEY = "forge-discovery-attribution";
const QUALIFIER_ENDPOINT =
  "https://sales.forgerpa.com/api/warm-intake/discovery-qualifier";

// gbraid/wbraid are included in the URL to mirror a real Google-ads landing,
// but the current capture code (qualifier-state.ts captureAttribution) reads
// gclid/msclkid/fbclid/utm_* only — NOT gbraid/wbraid — so we do not assert on
// them here. Documented finding, not a failure.
const LANDING_URL =
  "/book?gclid=" +
  SYNTH_GCLID +
  "&gbraid=SYNTH-GBRAID&wbraid=SYNTH-WBRAID" +
  "&utm_source=google&utm_medium=cpc&utm_campaign=erp-migration-services";

test("captures gclid and forwards it in the (aborted) lead submission", async ({
  page,
}) => {
  // ---- Stub Turnstile BEFORE any page script runs ----
  // render() immediately invokes the success callback with a synthetic token,
  // so submitWizard() sees a valid token and proceeds to the POST (which we
  // abort). The real challenges.cloudflare.com script is never loaded. The stub
  // also flips __turnstileTokenSet when the callback fires so the test can wait
  // for the token deterministically.
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

  // ---- THE safety boundary: capture + ABORT the lead POST ----
  let capturedPayload: Record<string, unknown> | null = null;
  await page.route(QUALIFIER_ENDPOINT, (route: Route) => {
    const req = route.request();
    if (req.method() === "POST") {
      try {
        capturedPayload = req.postDataJSON() as Record<string, unknown>;
      } catch {
        capturedPayload = { __unparseable: req.postData() ?? null };
      }
    }
    // ABORT — the request never reaches the real server, so NO lead is created.
    return route.abort();
  });

  // ---- Load the qualifier with the synthetic gclid ----
  await page.goto(LANDING_URL);

  // (a) gclid is PERSISTED where qualifier-state.ts puts it (localStorage).
  const stored = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { params?: { gclid?: string } }) : null;
  }, ATTRIBUTION_KEY);
  expect(stored, "attribution record should be persisted to localStorage").not.toBeNull();
  expect(stored?.params?.gclid).toBe(SYNTH_GCLID);

  // ---- Open the full wizard ----
  // The default /book view is now the short inquiry form (the 3-card entry fork
  // was removed in favor of leading with it). The full 6-step wizard — the path
  // this test walks — is reached via the inline "tell us more" link beneath the
  // form. gclid forwarding is identical on every path (submitWizard reads
  // captureAttribution() regardless of entry).
  await page.click("#qualifier-inquiry-tellmore");

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
  // Step 5: timeline
  await page.check('input[name="qualifier-timeline"][value="This quarter"]');
  await page.click("#qualifier-step5-next");

  // Step 6: contact + consent. Synthetic, non-deliverable details.
  await expect(page.locator('[data-qualifier-step="6"]')).toBeVisible();
  await page.fill("#qualifier-contact-name", "Synthetic Tester");
  await page.fill("#qualifier-contact-email", "synthetic.tester@example.com");
  await page.fill("#qualifier-contact-company", "Synthetic Co");
  // Consent is now passive (no checkbox gate); submitting implies agreement.

  // Wait until the stubbed Turnstile has actually fired its callback (the mount
  // is async: site-key fetch -> render). The submit handler bails early without
  // a token, so this guard makes the POST deterministic.
  await page.waitForFunction(
    () =>
      (window as unknown as { __turnstileTokenSet?: boolean })
        .__turnstileTokenSet === true,
  );

  // Submit. The POST is intercepted + aborted above.
  await Promise.all([
    page.waitForRequest(QUALIFIER_ENDPOINT),
    page.click("#qualifier-step6-submit"),
  ]);

  // (b) The gclid is included in the request payload to the qualifier endpoint.
  expect(capturedPayload, "the lead POST body should have been captured").not.toBeNull();
  const payload = capturedPayload as unknown as {
    source?: string;
    attribution?: { gclid?: string; utmCampaign?: string };
    qualifierAnswers?: { role?: string };
  };
  expect(payload.source).toBe("discovery_qualifier");
  expect(payload.attribution?.gclid).toBe(SYNTH_GCLID);
  // The campaign UTM also rides along (used later for conversion VALUE).
  expect(payload.attribution?.utmCampaign).toBe("erp-migration-services");
  expect(payload.qualifierAnswers?.role).toBe("Controller");

  // And prove safety held: no real lead could have been created because the
  // POST was aborted (capturedPayload came from the aborted request).
});
