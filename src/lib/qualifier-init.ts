/**
 * Discovery Qualifier — DOM wiring + cockpit submission.
 *
 * Imported by `book.astro` at the bottom of the file as a regular ES
 * module. Astro/Vite bundles this for the client.
 *
 * Wizard flow:
 *   - On DOMContentLoaded: capture attribution, restore prior state if
 *     present, hide the Cal.com iframe, show step 1 (or resume).
 *   - Each step: validate → save → advance.
 *   - Step 5 submit: compute tier client-side, show step 6 contact form.
 *   - Step 6 submit: POST to cockpit, show outcome screen based on
 *     server's authoritative tier verdict.
 *
 * No build-time secrets. Turnstile site key is fetched at runtime from
 * sales.forgerpa.com/api/turnstile-site-key so the website never needs
 * its own Turnstile env var.
 */
import {
  ALLOWED_ROLES,
  ALLOWED_CHALLENGES,
  ALLOWED_SYSTEMS,
  ALLOWED_TEAM_SIZES,
  ALLOWED_TIMELINES,
  computeFitTier,
  prefillFromContext,
  type FitTier,
} from "./qualifier-types.js";
import {
  emptyState,
  loadState,
  saveState,
  clearState,
  captureAttribution,
  type WizardState,
  type StepIndex,
} from "./qualifier-state.js";
import {
  validateEmailFormat,
  validateCompanyNotUrl,
  validatePhoneIfProvided,
  formatPhone,
  isPersonalEmail,
} from "./qualifier-validation.js";

/** Sales cockpit origin — discovery-qualifier endpoint + turnstile-site-key. */
const COCKPIT_ORIGIN = "https://sales.forgerpa.com";

/**
 * Passive consent constants. Consent is now implied by submitting the booking
 * (a small notice reads "By booking, you agree to our Terms and Privacy
 * Policy"); there is no longer a checkbox gate or a visible version/date line.
 * The version strings still travel with the consent payload so the per-
 * submission consent record references the exact document versions that were
 * live at the moment of submission (the courts' "version presented controls"
 * pillar). Keep these in sync with the published /terms and /privacy pages.
 *   - TERMS_VERSION: /terms page, effective 2026-06-01.
 *   - PRIVACY_VERSION: /privacy page's effective date (the live page).
 */
const TERMS_VERSION = "v1 (2026-06-01)";
// Privacy uses its "Last updated" date as its version identifier (the policy
// body says the Last-updated date is the revision marker). Bumped to
// 2026-06-01 when PR #32 materially revised the policy (retention 24mo →
// 5-6yr, state-neutral framing, T&C reference).
const PRIVACY_VERSION = "2026-06-01";
// Matches the passive notice rendered above the submit button on both booking
// paths. Recorded verbatim in the consent record server-side.
const CONSENT_ASSENT_TEXT =
  "By booking, you agree to our Terms and Privacy Policy.";
const CONSENT_FORM_NAME = "discovery_qualifier";

declare global {
  interface Window {
    turnstile?: {
      render: (
        selector: string,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string | undefined;
    };
  }
}

let state: WizardState = emptyState(null);
let turnstileWidgetId: string | null = null;
let turnstileToken: string | null = null;

// Essentials-path Turnstile is a SEPARATE widget instance (its own container,
// its own widget id + token). It reuses the exact same mount/fetch/failure
// machinery as the full wizard via mountTurnstileWidget(containerId), so the
// retry/failure block behaves identically.
let essentialsTurnstileWidgetId: string | null = null;
let essentialsTurnstileToken: string | null = null;

const WIZARD_ROOT_ID = "discovery-qualifier-wizard";

/* Container ids for the two Turnstile mounts. */
const TURNSTILE_WIZARD_CONTAINER = "qualifier-turnstile";
const TURNSTILE_ESSENTIALS_CONTAINER = "essentials-turnstile";

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function $$(selector: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

function showOnly(selector: string, root: ParentNode = document): void {
  $$(selector, root).forEach((el) => el.classList.add("hidden"));
}

function showStep(step: StepIndex): void {
  $$("[data-qualifier-step]").forEach((el) => {
    const target = Number(el.getAttribute("data-qualifier-step"));
    el.classList.toggle("hidden", target !== step);
  });
  $$("[data-qualifier-outcome]").forEach((el) => el.classList.add("hidden"));
  const progress = $("qualifier-progress-bar");
  if (progress) {
    const pct = Math.round((step / 6) * 100);
    progress.style.width = `${pct}%`;
  }
  const label = $("qualifier-progress-label");
  if (label) {
    label.textContent = `Step ${step} of 6`;
  }
  state.step = step;
  saveState(state);

  // Whenever step 6 becomes visible — whether reached by the step-5 Next
  // button OR by restoring saved state on page load (state.step === 6) —
  // ensure the Turnstile mount is at least attempted. Idempotent: the
  // mount function bails early if it already succeeded.
  if (step === 6 && getTurnstileStatus(TURNSTILE_WIZARD_CONTAINER) !== "ok") {
    void mountTurnstileWidget(TURNSTILE_WIZARD_CONTAINER);
  }
}

/**
 * Hide all three entry paths (fork, essentials, full wizard). Used by the
 * outcome + skip reveals so only the calendar (and the relevant heading)
 * remains. The full-wizard's own steps are additionally hidden by callers
 * that toggle `[data-qualifier-step]`.
 */
function hideAllPaths(): void {
  $("qualifier-entry-fork")?.classList.add("hidden");
  $("qualifier-essentials-path")?.classList.add("hidden");
  $("qualifier-full-path")?.classList.add("hidden");
}

function showOutcome(tier: FitTier): void {
  hideAllPaths();
  $$("[data-qualifier-step]").forEach((el) => el.classList.add("hidden"));
  $$("[data-qualifier-outcome]").forEach((el) => {
    const target = el.getAttribute("data-qualifier-outcome");
    el.classList.toggle("hidden", target !== tier);
  });
  const progressBar = $("qualifier-progress-container");
  if (progressBar) progressBar.classList.add("hidden");

  // The secondary "skip the questions" link only makes sense while the wizard
  // is being answered. Once we're on an outcome screen, hide it.
  setSkipLinkVisible(false);

  // For HIGH and MEDIUM tiers, reveal the booking container + mount the
  // Cal.com inline embed (auto-resizes — no internal scroll on the
  // confirmation screen).
  if (tier === "HIGH" || tier === "MEDIUM") {
    const calContainer = $("cal-booking-container");
    if (calContainer) {
      calContainer.classList.remove("hidden");
      initCalInlineEmbed();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Skip-to-calendar (secondary escape hatch)                           */
/* ------------------------------------------------------------------ */
/*
 * Lets an impatient but high-intent visitor (one who already clicked through
 * to /book to grab a discovery call) bypass the six qualifying questions and
 * go straight to the Cal.com calendar. This is a SECONDARY path: a small text
 * link under the current step, never the primary CTA. The wizard remains the
 * default flow for everyone who does not click it.
 *
 * The reveal uses the SAME mechanism as the HIGH/MEDIUM outcome path
 * (un-hide #cal-booking-container + initCalInlineEmbed), so the gclid metadata
 * still rides into the Cal booking. A skipper who books is then captured by
 * the Cal webhook as an inbound lead WITH gclid, so the conversion still
 * tracks even though they answered no qualifying questions.
 *
 * We deliberately do NOT compute or assign a fit tier here. The skipper
 * answered nothing, so there is nothing to score; we just show the calendar.
 */
/**
 * Fire a GA4 event via the site-wide gtag (loaded in BaseLayout). No-op and
 * never throws if gtag is absent (ad-blockers / consent tools), so analytics can
 * never break the booking flow. These events power the /book micro-funnel on the
 * Anvil Campaign Performance cockpit: book_option_selected -> book_widget_shown
 * -> book_submitted.
 */
function track(event: string, params?: Record<string, unknown>): void {
  try {
    const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof g === "function") g("event", event, params ?? {});
  } catch {
    /* analytics must never break the booking flow */
  }
}

function setSkipLinkVisible(visible: boolean): void {
  // Toggle the whole row (divider + link), not just the button, so the
  // separator line disappears with it.
  const row = $("qualifier-skip-to-calendar-row");
  if (row) row.classList.toggle("hidden", !visible);
}

function skipToCalendar(): void {
  // Hide all three entry paths (fork / essentials / full wizard).
  hideAllPaths();
  // Hide every wizard step and any outcome block.
  $$("[data-qualifier-step]").forEach((el) => el.classList.add("hidden"));
  $$("[data-qualifier-outcome]").forEach((el) => el.classList.add("hidden"));
  // Hide the progress meter and the skip link itself.
  const progress = $("qualifier-progress-container");
  if (progress) progress.classList.add("hidden");
  setSkipLinkVisible(false);

  // Show the neutral "grab a time" heading, if present.
  const skipHeading = $("qualifier-skip-heading");
  if (skipHeading) skipHeading.classList.remove("hidden");

  // Reveal the Cal.com inline embed — identical to the outcome reveal path.
  const calContainer = $("cal-booking-container");
  if (calContainer) {
    calContainer.classList.remove("hidden");
    initCalInlineEmbed();
  }
}

/* ------------------------------------------------------------------ */
/* Primary inquiry view + path switching                               */
/* ------------------------------------------------------------------ */
/*
 * On page load the visitor sees the short inquiry form (#qualifier-essentials-
 * path), NOT a chooser and NOT step 1. SINGLE INTENT: the form has ONE primary
 * button, "Send Your Request", which always submits (we capture the email). The
 * secondary paths — book a 30-minute call and "add more details" (the full
 * 6-step wizard) — appear only AFTER a successful submit, on the confirmation
 * screen (#essentials-confirmation), so they never compete with the form up
 * front. The full wizard's "Back to the quick form" control returns here.
 * Attribution (gclid) flows into the Cal booking metadata on every path because
 * initCalInlineEmbed() reads captureAttribution() regardless of entry path.
 */

function showInquiryPrimary(): void {
  // The default /book view: lead with the short inquiry form (the path formerly
  // reached only by picking the "essentials" card). Hide the full wizard and any
  // outcome/calendar so a visitor returning via "Back to the quick form" gets a
  // clean form.
  $("qualifier-essentials-path")?.classList.remove("hidden");
  // Always show the form body and hide any stale reach-out confirmation when
  // returning to this view (e.g. via "Back to the quick form").
  $("essentials-form-body")?.classList.remove("hidden");
  $("essentials-confirmation")?.classList.add("hidden");
  $("qualifier-full-path")?.classList.add("hidden");
  $$("[data-qualifier-outcome]").forEach((el) => el.classList.add("hidden"));
  $("qualifier-skip-heading")?.classList.add("hidden");
  // Keep the Cal embed hidden until a path actually books, but do NOT tear
  // down an already-mounted embed (Cal mounts once); just hide its container.
  $("cal-booking-container")?.classList.add("hidden");
  // Mount the inquiry Turnstile widget (idempotent; bails if already ok).
  void mountTurnstileWidget(TURNSTILE_ESSENTIALS_CONTAINER);
}

function showFullPathWizard(resumeStep?: StepIndex): void {
  $("qualifier-essentials-path")?.classList.add("hidden");
  $("qualifier-full-path")?.classList.remove("hidden");
  // Make sure the progress meter + skip link are visible again (they may have
  // been hidden by a prior outcome reveal in the same page view).
  $("qualifier-progress-container")?.classList.remove("hidden");
  setSkipLinkVisible(true);
  // showStep handles progress bar/label + Turnstile mount for step 6.
  showStep((resumeStep || state.step || 1) as StepIndex);
}

/* ------------------------------------------------------------------ */
/* Essentials path: one-screen submit                                  */
/* ------------------------------------------------------------------ */
/*
 * The essentials form collects only name / work email / company / free-text
 * "what would you like automated". It does NOT collect the six qualifier
 * answers, and it no longer fabricates a synthetic set to satisfy the server.
 * Instead the POST carries `essentials: true`; the server keys on that to skip
 * qualifier validation, set the fit tier to MEDIUM directly (the tier that
 * reveals the calendar), and persist the lead with no fake profile fields. The
 * visitor's real intent is captured verbatim in additionalNotes, and David sees
 * the lead in #discovery-bookings with no fabricated role/challenge/systems.
 */
function bindEssentialsPath(): void {
  // SINGLE INTENT: one primary button, "Send Your Request" (#essentials-send),
  // which submits in reach_out mode and shows the "we'll be in touch"
  // confirmation. Consent is PASSIVE (a notice above the button, no checkbox).
  $("essentials-send")?.addEventListener("click", () => {
    track("book_option_selected", { option: "reach_out" });
    void submitInquiry("reach_out");
  });
  // Legacy hook (no longer rendered): the old up-front "Pick a time" button that
  // submitted in book mode. Kept null-safe in case of a cached page; booking now
  // lives on the post-submit confirmation below.
  $("essentials-book")?.addEventListener("click", () => {
    track("book_option_selected", { option: "book" });
    void submitInquiry("book");
  });
  // From the reach-out confirmation (post-submit secondary options): a visitor
  // can still grab a time. Their name + email are already in `state`, so the Cal
  // prefill works without re-entering anything.
  $("essentials-confirm-book")?.addEventListener("click", () => {
    track("book_option_selected", { option: "book_after_reach_out" });
    showOutcome("MEDIUM");
  });
  // Or open the full 6-step wizard to "add more details". The name + email
  // already captured carry over (restorePriorState reflected them into state and
  // the wizard reads state.contact), so the visitor only adds the extra answers.
  $("essentials-confirm-tellmore")?.addEventListener("click", () => {
    track("book_option_selected", { option: "tell_us_more_after_reach_out" });
    // Carry the essentials name/email into the wizard's contact fields so the
    // visitor doesn't retype them on step 6.
    const nameEl = $("qualifier-contact-name") as HTMLInputElement | null;
    const emailEl = $("qualifier-contact-email") as HTMLInputElement | null;
    if (nameEl && state.contact.name) nameEl.value = state.contact.name;
    if (emailEl && state.contact.email) emailEl.value = state.contact.email;
    showFullPathWizard(1);
  });
}

type InquiryMode = "reach_out" | "book";

/**
 * Disable both submit buttons while a request is in flight; show "Submitting…"
 * on the one that was clicked, and restore its label afterward.
 */
function setEssentialsBusy(busy: boolean, activeBtnId: string): void {
  for (const id of ["essentials-send", "essentials-book"]) {
    const b = $(id) as HTMLButtonElement | null;
    if (b) b.disabled = busy;
  }
  const active = $(activeBtnId) as HTMLButtonElement | null;
  if (!active) return;
  if (busy) {
    active.dataset.label = active.textContent ?? "";
    active.textContent = "Submitting…";
  } else if (active.dataset.label) {
    active.textContent = active.dataset.label;
  }
}

/**
 * Submit the short inquiry form. Both buttons land here; `mode` decides the
 * post-success behavior. The POST is unchanged (essentials: true, no
 * qualifierAnswers, gclid + consent ride along). Company is now OPTIONAL, and
 * the reach-out path tags the note so David can tell a callback request apart
 * from a booking in the cockpit.
 */
async function submitInquiry(mode: InquiryMode): Promise<void> {
  const activeBtnId = mode === "book" ? "essentials-book" : "essentials-send";
  const name = ($("essentials-name") as HTMLInputElement | null)?.value.trim() ?? "";
  const email = ($("essentials-email") as HTMLInputElement | null)?.value.trim() ?? "";
  const company = ($("essentials-company") as HTMLInputElement | null)?.value.trim() ?? "";
  const notes = ($("essentials-notes") as HTMLTextAreaElement | null)?.value.trim() ?? "";

  setError("essentials", null);
  setError("essentials-email", null);
  setError("essentials-company", null);
  setError("essentials-notes", null);

  // Required: name, a valid-format email (work OR personal, the label is just
  // "Email"), and the free-text ask. Company is OPTIONAL; validate only if given.
  if (!name) {
    setError("essentials", "Please enter your name.");
    return;
  }
  if (!email) {
    setError("essentials-email", "Please enter your email.");
    return;
  }
  const emailErr = validateEmailFormat(email);
  if (emailErr) {
    setError("essentials-email", emailErr);
    return;
  }
  if (company) {
    const companyErr = validateCompanyNotUrl(company);
    if (companyErr) {
      setError("essentials-company", companyErr);
      return;
    }
  }
  if (!notes) {
    setError("essentials-notes", "Tell us in a sentence what you'd like automated.");
    return;
  }

  if (!essentialsTurnstileToken) {
    const widgetActuallyMounted =
      getTurnstileStatus(TURNSTILE_ESSENTIALS_CONTAINER) === "ok" &&
      window.turnstile != null &&
      essentialsTurnstileWidgetId != null;
    setError(
      "essentials",
      widgetActuallyMounted
        ? "Please complete the spam-check above (click the checkbox), then try again."
        : "The spam-check widget didn't load (likely a browser shield / privacy extension). See the red box above for fix instructions, then click 'Retry spam-check'.",
    );
    return;
  }

  setEssentialsBusy(true, activeBtnId);

  const attribution = captureAttribution();

  // Reach-out has no booking, so tag the note that the lead asked for a callback.
  // Book leaves the note clean (a Cal booking follows). Company is omitted from
  // the payload when blank.
  const additionalNotes =
    mode === "reach_out"
      ? `${notes}\n\n[Visitor asked us to reach out; no time booked.]`
      : notes;

  const payload = {
    source: "discovery_qualifier",
    essentials: true,
    // Which button was pressed: drives the reach-out confirmation emails server-side.
    contactPreference: mode,
    name,
    email,
    company: company || undefined,
    additionalNotes: additionalNotes || undefined,
    attribution,
    turnstileToken: essentialsTurnstileToken,
    fromContext: state.fromContext,
    consent: {
      consentGiven: true,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      assentText: CONSENT_ASSENT_TEXT,
      formName: CONSENT_FORM_NAME,
      clientTimestamp: new Date().toISOString(),
    },
  };

  let serverTier: FitTier | null = null;
  let serverError: string | null = null;
  let response: Response | null = null;

  try {
    response = await fetch(
      `${COCKPIT_ORIGIN}/api/warm-intake/discovery-qualifier`,
      {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[discovery-qualifier] inquiry fetch failed:", err);
    serverError =
      "Couldn't reach the booking service. If you're on Brave or a privacy browser, try lowering Shields for sales.forgerpa.com and retry.";
  }

  if (response && !serverError) {
    let parsed: { tier?: FitTier; error?: string } | null = null;
    try {
      parsed = (await response.json()) as { tier?: FitTier; error?: string };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[discovery-qualifier] inquiry response parse failed:", err);
      serverError = `Booking service responded with HTTP ${response.status} (no JSON body). Please try again, or email sales@forgerpa.com.`;
    }
    if (parsed) {
      if (response.ok && parsed.tier) {
        serverTier = parsed.tier;
      } else {
        serverError =
          parsed.error ||
          `Submission failed (HTTP ${response.status}). Please try again.`;
      }
    }
  }

  if (serverError) {
    setError("essentials", serverError);
    setEssentialsBusy(false, activeBtnId);
    if (essentialsTurnstileWidgetId && window.turnstile) {
      window.turnstile.reset(essentialsTurnstileWidgetId);
      essentialsTurnstileToken = null;
    }
    return;
  }

  // Success. Stash name/email so the Cal.com prefill works (the book path, or a
  // changed-mind booking from the reach-out confirmation).
  state.contact.name = name;
  state.contact.email = email;
  state.computedTier = serverTier || "MEDIUM";
  state.completedAt = Date.now();
  clearState();

  if (mode === "book") {
    showOutcome(state.computedTier);
  } else {
    track("inquiry_submitted", { method: "reach_out" });
    $("essentials-form-body")?.classList.add("hidden");
    $("essentials-confirmation")?.classList.remove("hidden");
  }
}

/* ------------------------------------------------------------------ */
/* Cal.com inline embed                                               */
/* ------------------------------------------------------------------ */
/*
 * Replaces the old fixed-height <iframe>. The official Cal.com inline embed
 * auto-resizes the container to fit its content — the calendar while picking
 * a time AND the taller "This meeting is scheduled" confirmation — so the
 * confirmation is fully visible without an internal scrollbar.
 *
 * Name + email prefill via the embed `config` (replaces the old URL-param
 * prefill). We deliberately do NOT pass the qualification summary or notes —
 * that already lives in the cockpit (Notion + Postgres) and the
 * #discovery-bookings Discord alert; Cal is purely the date/time picker.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CalApi = any;

let calEmbedLoaded = false;

function loadCalEmbed(): void {
  if (calEmbedLoaded) return;
  calEmbedLoaded = true;
  // Official Cal.com embed loader snippet (vanilla), lightly typed via `any`.
  /* eslint-disable */
  (function (C: any, A: string, L: string) {
    const p = function (a: any, ar: any) {
      a.q.push(ar);
    };
    const d = C.document;
    C.Cal =
      C.Cal ||
      function () {
        const cal = C.Cal;
        const ar = arguments;
        if (!cal.loaded) {
          cal.ns = {};
          cal.q = cal.q || [];
          d.head.appendChild(d.createElement("script")).src = A;
          cal.loaded = true;
        }
        if (ar[0] === L) {
          const api = function () {
            p(api, arguments);
          };
          const namespace = ar[1];
          api.q = api.q || [];
          if (typeof namespace === "string") {
            cal.ns[namespace] = cal.ns[namespace] || api;
            p(cal.ns[namespace], ar);
            p(cal, ["initNamespace", namespace]);
          } else {
            p(cal, ar);
          }
          return;
        }
        p(cal, ar);
      };
  })(window as any, "https://app.cal.com/embed/embed.js", "init");
  /* eslint-enable */
  const Cal = (window as unknown as { Cal?: CalApi }).Cal;
  if (typeof Cal === "function") {
    Cal("init", { origin: "https://app.cal.com" });
  }
}

let calEmbedMounted = false;

function initCalInlineEmbed(): void {
  if (calEmbedMounted) return; // mount once
  loadCalEmbed();
  const Cal = (window as unknown as { Cal?: CalApi }).Cal;
  if (typeof Cal !== "function") return;
  calEmbedMounted = true;

  // Base prefill config (name + email, unchanged).
  const config: Record<string, unknown> = {
    name: state.contact.name || "",
    email: state.contact.email || "",
    utm_source: "forgerpa-site",
    utm_medium: "book-page",
  };

  // Conversion-tracking hardening: carry the gclid into the booking metadata
  // so the forgerpa-sales webhook (which reads payload.metadata.gclid) can
  // match the conversion to the Google Ads click even when the booking email
  // differs from the qualifier email. Captured at page load with a 30-day TTL
  // (qualifier-state.captureAttribution). Only attach `metadata` when a gclid
  // is actually present — never send `metadata: { gclid: null }`.
  const gclid = captureAttribution().gclid;
  if (gclid) {
    config.metadata = { gclid };
  }

  Cal("inline", {
    elementOrSelector: "#cal-booking-inline",
    calLink: "david-farley/discovery-call",
    config,
  });
  Cal("ui", { hideEventTypeDetails: true });

  // Funnel instrumentation (paid /book micro-funnel in the Anvil cockpit): the
  // scheduler became visible, and a callback for a completed booking. Mounts
  // once (calEmbedMounted guard), so each fires at most once per page view.
  track("book_widget_shown");
  try {
    Cal("on", {
      action: "bookingSuccessful",
      callback: () => track("book_submitted"),
    });
  } catch {
    /* instrumentation only — never affect booking */
  }
}

function setError(stepId: string, message: string | null): void {
  const el = $(`${stepId}-error`);
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.classList.remove("hidden");
  } else {
    el.textContent = "";
    el.classList.add("hidden");
  }
}

/* ------------------------------------------------------------------ */
/* Step 1: Role                                                        */
/* ------------------------------------------------------------------ */
function bindStep1(): void {
  $$("input[name=qualifier-role]").forEach((el) => {
    (el as HTMLInputElement).addEventListener("change", () => {
      state.answers.role = (el as HTMLInputElement).value;
      saveState(state);
    });
  });
  $("qualifier-step1-next")?.addEventListener("click", () => {
    if (!state.answers.role) {
      setError("qualifier-step1", "Please select your role to continue.");
      return;
    }
    setError("qualifier-step1", null);
    showStep(2);
  });
}

/* ------------------------------------------------------------------ */
/* Step 2: Primary challenge                                           */
/* ------------------------------------------------------------------ */
function bindStep2(): void {
  $$("input[name=qualifier-challenge]").forEach((el) => {
    (el as HTMLInputElement).addEventListener("change", () => {
      state.answers.primaryChallenge = (el as HTMLInputElement).value;
      saveState(state);
    });
  });
  $("qualifier-step2-back")?.addEventListener("click", () => showStep(1));
  $("qualifier-step2-next")?.addEventListener("click", () => {
    if (!state.answers.primaryChallenge) {
      setError("qualifier-step2", "Please choose the biggest pain point.");
      return;
    }
    setError("qualifier-step2", null);
    showStep(3);
  });
}

/* ------------------------------------------------------------------ */
/* Step 3: Primary systems (multi-select)                              */
/* ------------------------------------------------------------------ */
function bindStep3(): void {
  $$("input[name=qualifier-systems]").forEach((el) => {
    (el as HTMLInputElement).addEventListener("change", () => {
      const selected = $$("input[name=qualifier-systems]:checked").map(
        (e) => (e as HTMLInputElement).value,
      );
      state.answers.primarySystems = selected;
      saveState(state);
    });
  });
  $("qualifier-step3-back")?.addEventListener("click", () => showStep(2));
  $("qualifier-step3-next")?.addEventListener("click", () => {
    if (!state.answers.primarySystems || state.answers.primarySystems.length === 0) {
      setError(
        "qualifier-step3",
        "Pick at least one system — even if it's just Excel.",
      );
      return;
    }
    setError("qualifier-step3", null);
    showStep(4);
  });
}

/* ------------------------------------------------------------------ */
/* Step 4: Team size                                                   */
/* ------------------------------------------------------------------ */
function bindStep4(): void {
  $$("input[name=qualifier-team-size]").forEach((el) => {
    (el as HTMLInputElement).addEventListener("change", () => {
      state.answers.teamSize = (el as HTMLInputElement).value;
      saveState(state);
    });
  });
  $("qualifier-step4-back")?.addEventListener("click", () => showStep(3));
  $("qualifier-step4-next")?.addEventListener("click", () => {
    if (!state.answers.teamSize) {
      setError("qualifier-step4", "Pick the size that's closest to your team.");
      return;
    }
    setError("qualifier-step4", null);
    showStep(5);
  });
}

/* ------------------------------------------------------------------ */
/* Step 5: Timeline                                                    */
/* ------------------------------------------------------------------ */
function bindStep5(): void {
  $$("input[name=qualifier-timeline]").forEach((el) => {
    (el as HTMLInputElement).addEventListener("change", () => {
      state.answers.timeline = (el as HTMLInputElement).value;
      saveState(state);
    });
  });
  $("qualifier-step5-back")?.addEventListener("click", () => showStep(4));
  $("qualifier-step5-next")?.addEventListener("click", () => {
    if (!state.answers.timeline) {
      setError("qualifier-step5", "Pick a timeline so we can prioritize correctly.");
      return;
    }
    setError("qualifier-step5", null);
    // Compute client-side tier preview (server is still authoritative).
    if (
      state.answers.role &&
      state.answers.primaryChallenge &&
      state.answers.primarySystems &&
      state.answers.teamSize &&
      state.answers.timeline
    ) {
      state.computedTier = computeFitTier({
        role: state.answers.role,
        primaryChallenge: state.answers.primaryChallenge,
        primarySystems: state.answers.primarySystems,
        teamSize: state.answers.teamSize,
        timeline: state.answers.timeline,
      });
      saveState(state);
    }
    showStep(6);
    void mountTurnstileWidget();
  });
}

/* ------------------------------------------------------------------ */
/* Step 6: Contact info + Turnstile + submit                           */
/* ------------------------------------------------------------------ */
function bindStep6(): void {
  const fields = ["name", "email", "company", "phone", "linkedinUrl", "additionalNotes"];
  for (const field of fields) {
    const el = $(`qualifier-contact-${field}`) as HTMLInputElement | null;
    if (!el) continue;
    el.addEventListener("input", () => {
      // Phone gets live-formatted to NNN-NNN-NNNN as the user types.
      // Idempotent — accepts raw digits, partial formats, or pre-formatted
      // pastes; strips non-digits before re-formatting.
      if (field === "phone") {
        const formatted = formatPhone(el.value);
        if (formatted !== el.value) {
          // Preserve cursor position when reformatting wouldn't move the
          // last character forward (e.g., user typing at end of field).
          const wasAtEnd = el.selectionStart === el.value.length;
          el.value = formatted;
          if (wasAtEnd) {
            el.setSelectionRange(formatted.length, formatted.length);
          }
        }
      }
      (state.contact as Record<string, string>)[field] = el.value;
      saveState(state);
    });
  }
  // Consent is now PASSIVE: a notice above the submit button ("By booking, you
  // agree to our Terms and Privacy Policy"), no checkbox gate. Submitting
  // implies agreement and a consent record is still POSTed + stored server-side
  // (see the `consent` object in submitWizard). So the submit button is no
  // longer disabled-until-checked.

  $("qualifier-step6-back")?.addEventListener("click", () => showStep(5));
  $("qualifier-step6-submit")?.addEventListener("click", () => void submitWizard());
}

/**
 * Status of the Turnstile widget mount. Used by submitWizard() to give a
 * better error message when the widget never actually rendered (most
 * commonly because Brave Shields / a privacy extension blocked the script
 * load from challenges.cloudflare.com).
 */
type TurnstileMountStatus = "ok" | "site-key-fetch-failed" | "script-blocked" | "render-failed";

// Mount status tracked PER container so the wizard widget and the essentials
// widget don't clobber each other's state. submitWizard() reads the wizard
// container's status; submitEssentials() reads the essentials container's.
const turnstileMountStatusByContainer: Record<string, TurnstileMountStatus | "pending"> = {
  [TURNSTILE_WIZARD_CONTAINER]: "pending",
  [TURNSTILE_ESSENTIALS_CONTAINER]: "pending",
};

function getTurnstileStatus(containerId: string): TurnstileMountStatus | "pending" {
  return turnstileMountStatusByContainer[containerId] ?? "pending";
}

function renderTurnstileFailureBlock(
  reason: TurnstileMountStatus,
  containerId: string,
): void {
  const container = $(containerId);
  if (!container) return;
  // Wipe whatever's in the container (could be empty, could be a previous
  // attempt's residual node).
  container.innerHTML = "";
  container.classList.remove("hidden");

  const explanation =
    reason === "site-key-fetch-failed"
      ? "We couldn't reach our spam-check service. This usually means a network or privacy-extension is blocking <code>sales.forgerpa.com</code>."
      : "Our spam-check widget didn't load. This usually means a browser shield or privacy extension is blocking <code>challenges.cloudflare.com</code>.";

  const help = document.createElement("div");
  help.className =
    "rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900";
  help.innerHTML = `
    <p class="font-semibold m-0">Spam-check widget didn't load</p>
    <p class="mt-2 mb-0">${explanation}</p>
    <p class="mt-2 mb-0">
      Fix:
      <span class="font-semibold">click the Brave lion icon</span>
      (or your privacy extension's shield icon) in your address bar and
      turn shields <span class="font-semibold">OFF for this site</span>.
      Then click the button below.
    </p>
  `;
  container.appendChild(help);

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className =
    "mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-900 hover:bg-red-50";
  retry.textContent = "Retry spam-check";
  retry.addEventListener("click", () => {
    container.innerHTML = "";
    turnstileMountStatusByContainer[containerId] = "pending";
    void mountTurnstileWidget(containerId);
  });
  container.appendChild(retry);
}

async function mountTurnstileWidget(
  containerId: string = TURNSTILE_WIZARD_CONTAINER,
): Promise<void> {
  const container = $(containerId);
  if (!container) return;
  if (container.hasChildNodes() && getTurnstileStatus(containerId) === "ok") return; // already mounted successfully

  // Fetch site key from cockpit
  let siteKey: string | null = null;
  try {
    const r = await fetch(`${COCKPIT_ORIGIN}/api/turnstile-site-key`, {
      mode: "cors",
    });
    if (r.ok) {
      const json = (await r.json()) as { siteKey?: string };
      siteKey = json.siteKey ?? null;
    }
  } catch {
    /* will fall through to failure handling below */
  }
  if (!siteKey) {
    turnstileMountStatusByContainer[containerId] = "site-key-fetch-failed";
    renderTurnstileFailureBlock("site-key-fetch-failed", containerId);
    return;
  }

  // Load Turnstile script if not yet loaded.
  if (!window.turnstile) {
    // 8-second timeout: Brave (and some other shields) silently abandon
    // the script load without firing `script.onerror`. Without a
    // timeout, the await below would hang forever and the failure block
    // would never render. 8 seconds is long enough for slow connections
    // to legitimately succeed, short enough that a blocked load doesn't
    // make the wizard appear frozen.
    const scriptLoaded = await new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      const timeoutId = window.setTimeout(() => settle(false), 8000);
      const onSuccess = () => {
        window.clearTimeout(timeoutId);
        settle(true);
      };
      const onError = () => {
        window.clearTimeout(timeoutId);
        settle(false);
      };
      const existing = document.querySelector(
        'script[src*="challenges.cloudflare.com/turnstile"]',
      );
      if (existing) {
        existing.addEventListener("load", onSuccess);
        existing.addEventListener("error", onError);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = onSuccess;
      script.onerror = onError;
      document.head.appendChild(script);
    });
    if (!scriptLoaded) {
      turnstileMountStatusByContainer[containerId] = "script-blocked";
      renderTurnstileFailureBlock("script-blocked", containerId);
      return;
    }
  }
  // Belt-and-suspenders: in some browsers, the script "loads" successfully
  // (script.onload fires) but the window.turnstile global never appears
  // because the script body was tampered/blocked. Treat that the same as
  // a script-load failure.
  if (!window.turnstile) {
    turnstileMountStatusByContainer[containerId] = "script-blocked";
    renderTurnstileFailureBlock("script-blocked", containerId);
    return;
  }

  try {
    const widgetId = window.turnstile.render(`#${container.id}`, {
      sitekey: siteKey,
      theme: "light",
      callback: (token: string) => {
        if (containerId === TURNSTILE_ESSENTIALS_CONTAINER) {
          essentialsTurnstileToken = token;
        } else {
          turnstileToken = token;
        }
      },
      "error-callback": () => {
        if (containerId === TURNSTILE_ESSENTIALS_CONTAINER) {
          essentialsTurnstileToken = null;
        } else {
          turnstileToken = null;
        }
      },
    });
    if (containerId === TURNSTILE_ESSENTIALS_CONTAINER) {
      essentialsTurnstileWidgetId = widgetId;
    } else {
      turnstileWidgetId = widgetId;
    }
    turnstileMountStatusByContainer[containerId] = "ok";
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[discovery-qualifier] turnstile.render threw:", err);
    turnstileMountStatusByContainer[containerId] = "render-failed";
    renderTurnstileFailureBlock("render-failed", containerId);
    return;
  }
}

async function submitWizard(): Promise<void> {
  const contact = state.contact;
  const name = (contact.name || "").trim();
  const email = (contact.email || "").trim();
  const company = (contact.company || "").trim();
  const phone = (contact.phone || "").trim();
  const linkedinUrl = (contact.linkedinUrl || "").trim();
  const additionalNotes = (contact.additionalNotes || "").trim();

  setError("qualifier-step6", null);
  setError("qualifier-step6-email", null);
  setError("qualifier-step6-company", null);
  setError("qualifier-step6-phone", null);

  // Consent is passive (no checkbox gate). Submitting implies agreement; the
  // consent record still rides the POST payload below and is stored server-side.

  // Required fields.
  if (!name) {
    setError("qualifier-step6", "Please enter your name.");
    return;
  }
  if (!email) {
    setError("qualifier-step6-email", "Please enter your work email.");
    return;
  }
  // Email validation: format-only (free-domain submitters are accepted —
  // see qualifier-validation.ts policy note 2026-05-25). The personal-
  // email modifier is computed below and used both for the client-side
  // tier preview and as a payload field for the server.
  const emailErr = validateEmailFormat(email);
  if (emailErr) {
    setError("qualifier-step6-email", emailErr);
    return;
  }
  if (!company) {
    setError("qualifier-step6-company", "Please enter your company name.");
    return;
  }
  const companyErr = validateCompanyNotUrl(company);
  if (companyErr) {
    setError("qualifier-step6-company", companyErr);
    return;
  }
  const phoneErr = validatePhoneIfProvided(phone);
  if (phoneErr) {
    setError("qualifier-step6-phone", phoneErr);
    return;
  }
  if (!turnstileToken) {
    // Distinguish "widget never loaded" (Brave Shields / privacy
    // extension blocked it) from "widget loaded but user didn't click
    // it." The former needs an actionable fix; the latter just needs a
    // nudge to interact with the widget.
    const widgetActuallyMounted =
      getTurnstileStatus(TURNSTILE_WIZARD_CONTAINER) === "ok" &&
      window.turnstile != null &&
      turnstileWidgetId != null;
    if (!widgetActuallyMounted) {
      setError(
        "qualifier-step6",
        "The spam-check widget didn't load (likely a browser shield / privacy extension). See the red box above for fix instructions, then click 'Retry spam-check'.",
      );
    } else {
      setError(
        "qualifier-step6",
        "Please complete the spam-check above (click the checkbox), then try again.",
      );
    }
    return;
  }
  if (
    !state.answers.role ||
    !state.answers.primaryChallenge ||
    !state.answers.primarySystems ||
    state.answers.primarySystems.length === 0 ||
    !state.answers.teamSize ||
    !state.answers.timeline
  ) {
    setError(
      "qualifier-step6",
      "Some earlier answers are missing — please go back and complete every step.",
    );
    return;
  }

  const submitBtn = $("qualifier-step6-submit") as HTMLButtonElement | null;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
  }

  const attribution = captureAttribution();

  // Recompute the local tier preview now that we have the email — passes
  // the personalEmail modifier so the fallback (used if the server call
  // fails) matches what the server would have returned. Server is still
  // authoritative when its response arrives.
  const personalEmailFlag = isPersonalEmail(email);
  state.computedTier = computeFitTier(
    {
      role: state.answers.role,
      primaryChallenge: state.answers.primaryChallenge,
      primarySystems: state.answers.primarySystems,
      teamSize: state.answers.teamSize,
      timeline: state.answers.timeline,
    },
    { personalEmail: personalEmailFlag },
  );

  const payload = {
    source: "discovery_qualifier",
    name,
    email,
    company,
    phone: phone || undefined,
    linkedinUrl: linkedinUrl || undefined,
    additionalNotes: additionalNotes || undefined,
    qualifierAnswers: {
      role: state.answers.role,
      primaryChallenge: state.answers.primaryChallenge,
      primarySystems: state.answers.primarySystems,
      teamSize: state.answers.teamSize,
      timeline: state.answers.timeline,
    },
    attribution,
    turnstileToken,
    fromContext: state.fromContext,
    // Clickwrap consent. The server assembles the authoritative record
    // (server UTC timestamp + email + raw IP); these client-supplied fields
    // capture exactly which document versions + assent text were displayed.
    consent: {
      consentGiven: true,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      assentText: CONSENT_ASSENT_TEXT,
      formName: CONSENT_FORM_NAME,
      clientTimestamp: new Date().toISOString(),
    },
  };

  let serverTier: FitTier | null = null;
  let serverError: string | null = null;
  let response: Response | null = null;

  // Step A: the fetch itself. If this throws, we never reached the backend
  // (CORS rejection at browser level, Brave Shields / privacy extension
  // blocking, DNS / network failure, etc.).
  try {
    response = await fetch(
      `${COCKPIT_ORIGIN}/api/warm-intake/discovery-qualifier`,
      {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[discovery-qualifier] fetch failed:", err);
    serverError =
      "Couldn't reach the booking service. If you're on Brave or a privacy browser, try lowering Shields for sales.forgerpa.com and retry.";
  }

  // Step B: parse the response body. Distinguish "valid JSON with error"
  // from "non-JSON body" so we surface the actual HTTP status in the
  // catch-all case (helps diagnose Vercel error pages, edge timeouts, etc.).
  if (response && !serverError) {
    let parsed: { tier?: FitTier; error?: string } | null = null;
    try {
      parsed = (await response.json()) as { tier?: FitTier; error?: string };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[discovery-qualifier] response parse failed:", err);
      serverError = `Booking service responded with HTTP ${response.status} (no JSON body). Please try again, or email sales@forgerpa.com.`;
    }
    if (parsed) {
      if (response.ok && parsed.tier) {
        serverTier = parsed.tier;
      } else {
        serverError =
          parsed.error ||
          `Submission failed (HTTP ${response.status}). Please try again.`;
      }
    }
  }

  if (serverError) {
    setError("qualifier-step6", serverError);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit and book";
    }
    if (turnstileWidgetId && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId);
      turnstileToken = null;
    }
    return;
  }

  // Success — clear state, show outcome screen.
  const finalTier = serverTier || state.computedTier || "MEDIUM";
  state.computedTier = finalTier;
  state.completedAt = Date.now();
  // We keep the contact in state so the Cal.com prefill in showOutcome works.
  showOutcome(finalTier);
  // Clear localStorage so a future visitor starts fresh.
  clearState();
}

/* ------------------------------------------------------------------ */
/* Pre-fill from `?from=` context                                      */
/* ------------------------------------------------------------------ */
function applyContextPrefill(): void {
  if (!state.fromContext) return;
  const prefill = prefillFromContext(state.fromContext);
  if (!prefill) return;

  if (prefill.challenge && !state.answers.primaryChallenge) {
    state.answers.primaryChallenge = prefill.challenge;
    const radio = document.querySelector<HTMLInputElement>(
      `input[name=qualifier-challenge][value="${prefill.challenge}"]`,
    );
    if (radio) radio.checked = true;
  }
  if (prefill.systems && (!state.answers.primarySystems || state.answers.primarySystems.length === 0)) {
    state.answers.primarySystems = prefill.systems;
    for (const sys of prefill.systems) {
      const cb = document.querySelector<HTMLInputElement>(
        `input[name=qualifier-systems][value="${sys}"]`,
      );
      if (cb) cb.checked = true;
    }
  }
  if (prefill.systemsReorderToTop) {
    const container = $("qualifier-systems-list");
    if (container) {
      // Move the listed systems' parent labels to the top of the container.
      for (let i = prefill.systemsReorderToTop.length - 1; i >= 0; i--) {
        const sys = prefill.systemsReorderToTop[i];
        const radio = container.querySelector<HTMLInputElement>(
          `input[name=qualifier-systems][value="${sys}"]`,
        );
        const label = radio?.closest("label");
        if (label && container.firstChild !== label) {
          container.insertBefore(label, container.firstChild);
        }
      }
    }
  }
  saveState(state);
}

/* ------------------------------------------------------------------ */
/* Restore prior state from localStorage                               */
/* ------------------------------------------------------------------ */
function restorePriorState(): void {
  const prior = loadState();
  if (!prior) return;
  state = prior;

  // Reflect saved answers in the DOM controls.
  if (state.answers.role) {
    const r = document.querySelector<HTMLInputElement>(
      `input[name=qualifier-role][value="${state.answers.role}"]`,
    );
    if (r) r.checked = true;
  }
  if (state.answers.primaryChallenge) {
    const r = document.querySelector<HTMLInputElement>(
      `input[name=qualifier-challenge][value="${state.answers.primaryChallenge}"]`,
    );
    if (r) r.checked = true;
  }
  if (state.answers.primarySystems) {
    for (const sys of state.answers.primarySystems) {
      const cb = document.querySelector<HTMLInputElement>(
        `input[name=qualifier-systems][value="${sys}"]`,
      );
      if (cb) cb.checked = true;
    }
  }
  if (state.answers.teamSize) {
    const r = document.querySelector<HTMLInputElement>(
      `input[name=qualifier-team-size][value="${state.answers.teamSize}"]`,
    );
    if (r) r.checked = true;
  }
  if (state.answers.timeline) {
    const r = document.querySelector<HTMLInputElement>(
      `input[name=qualifier-timeline][value="${state.answers.timeline}"]`,
    );
    if (r) r.checked = true;
  }
  for (const f of [
    "name",
    "email",
    "company",
    "phone",
    "linkedinUrl",
    "additionalNotes",
  ] as const) {
    const v = (state.contact as Record<string, string | undefined>)[f];
    if (v) {
      // additionalNotes is a <textarea>; the rest are <input>. Both expose
      // .value, so HTMLInputElement is a safe-enough cast for assignment.
      const input = $(`qualifier-contact-${f}`) as HTMLInputElement | null;
      if (input) input.value = v;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */
export function initDiscoveryQualifier(): void {
  if (!$(WIZARD_ROOT_ID)) return; // not on /book

  const params = new URLSearchParams(window.location.search);
  const fromContext = (params.get("from") || "").trim() || null;

  // Always start from empty state with current `from` context, then maybe
  // restore prior in-progress.
  state = emptyState(fromContext);
  captureAttribution();
  restorePriorState();
  // Apply prefill AFTER state restore so we don't clobber the user's prior
  // intentional choices.
  applyContextPrefill();

  // Hide Cal.com iframe initially — only revealed after HIGH/MEDIUM outcome.
  const calContainer = $("cal-booking-container");
  if (calContainer) calContainer.classList.add("hidden");

  bindStep1();
  bindStep2();
  bindStep3();
  bindStep4();
  bindStep5();
  bindStep6();
  bindEssentialsPath();

  // Legacy hook (no longer rendered on the single-intent contact page): the old
  // "tell us more first" link beneath the inquiry form. Kept null-safe in case a
  // cached page still has it; the "add more details" path now lives on the
  // post-submit confirmation (bound in bindEssentialsPath).
  $("qualifier-inquiry-tellmore")?.addEventListener("click", (e) => {
    e.preventDefault();
    track("book_option_selected", { option: "tell_us_more" });
    showFullPathWizard();
  });

  // "Back to the quick form" links (on the full wizard) return to the primary
  // inquiry form.
  $$("[data-back-to-options]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      showInquiryPrimary();
    });
  });

  // Secondary skip-to-calendar link inside the wizard. Visible only while the
  // wizard is being answered (showOutcome hides it on any outcome). One click
  // reveals the calendar directly.
  $("qualifier-skip-to-calendar")?.addEventListener("click", (e) => {
    e.preventDefault();
    skipToCalendar();
  });

  // Default view = the short inquiry form (the primary path). Exception: a
  // visitor who was MID-WIZARD in a prior session (has in-progress answers, has
  // NOT completed) resumes the full wizard at their saved step so they don't
  // lose progress. A completed prior state does NOT auto-reveal the calendar (a
  // booking needs a fresh submit), so those visitors also start at the form.
  const midWizard =
    !state.completedAt &&
    (((state.step ?? 1) > 1) ||
      !!state.answers.role ||
      !!state.answers.primaryChallenge ||
      (state.answers.primarySystems?.length ?? 0) > 0 ||
      !!state.answers.teamSize ||
      !!state.answers.timeline);

  if (midWizard) {
    showFullPathWizard((state.step || 1) as StepIndex);
  } else {
    showInquiryPrimary();
  }
}

// Auto-init when imported.
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDiscoveryQualifier);
  } else {
    initDiscoveryQualifier();
  }
}

/* Reference the constants so tree-shaking keeps them — they're referenced
 * by the build step + by the option lists rendered in book.astro at SSR. */
export const _OPTIONS_REFS = {
  ALLOWED_ROLES,
  ALLOWED_CHALLENGES,
  ALLOWED_SYSTEMS,
  ALLOWED_TEAM_SIZES,
  ALLOWED_TIMELINES,
};
