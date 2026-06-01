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

const WIZARD_ROOT_ID = "discovery-qualifier-wizard";

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
  if (step === 6 && turnstileMountStatus !== "ok") {
    void mountTurnstileWidget();
  }
}

function showOutcome(tier: FitTier): void {
  $$("[data-qualifier-step]").forEach((el) => el.classList.add("hidden"));
  $$("[data-qualifier-outcome]").forEach((el) => {
    const target = el.getAttribute("data-qualifier-outcome");
    el.classList.toggle("hidden", target !== tier);
  });
  const progressBar = $("qualifier-progress-container");
  if (progressBar) progressBar.classList.add("hidden");

  // For HIGH and MEDIUM tiers, also reveal + prefill the Cal.com iframe.
  if (tier === "HIGH" || tier === "MEDIUM") {
    const calContainer = $("cal-booking-container");
    if (calContainer) {
      calContainer.classList.remove("hidden");
      prefillCalIframe();
    }
  }
}

function prefillCalIframe(): void {
  const iframe = $("cal-booking-iframe") as HTMLIFrameElement | null;
  if (!iframe) return;
  const src = iframe.getAttribute("src") || "";
  let url: URL;
  try {
    url = new URL(src, window.location.origin);
  } catch {
    return;
  }
  if (state.contact.name) url.searchParams.set("name", state.contact.name);
  if (state.contact.email) url.searchParams.set("email", state.contact.email);
  const notes = formatQualifierNotesForCal();
  if (notes) url.searchParams.set("notes", notes);
  iframe.setAttribute("src", url.toString());
}

function formatQualifierNotesForCal(): string {
  const a = state.answers;
  const parts: string[] = [];
  if (a.role) parts.push(`Role: ${a.role}`);
  if (a.primaryChallenge) parts.push(`Challenge: ${a.primaryChallenge}`);
  if (a.primarySystems && a.primarySystems.length) {
    parts.push(`Systems: ${a.primarySystems.join(", ")}`);
  }
  if (a.teamSize) parts.push(`Team size: ${a.teamSize}`);
  if (a.timeline) parts.push(`Timeline: ${a.timeline}`);
  if (state.contact.company) parts.push(`Company: ${state.contact.company}`);
  if (state.contact.additionalNotes) {
    parts.push(`Notes: ${state.contact.additionalNotes}`);
  }
  return parts.join(" | ");
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
  $("qualifier-step6-back")?.addEventListener("click", () => showStep(5));
  $("qualifier-step6-submit")?.addEventListener("click", () => void submitWizard());
}

/**
 * Brave detection. The Brave browser exposes a `navigator.brave` object
 * with an `isBrave()` async method that returns true on Brave. We use
 * this to show a preemptive warning ABOVE step 6 (before the user hits
 * submit and hits the existing post-failure error message), since
 * Brave Shields aggressively blocks the Cloudflare Turnstile widget AND
 * the cross-origin POST to sales.forgerpa.com.
 *
 * Returns a Promise<boolean>. Resolves false on any error (e.g.,
 * navigator.brave undefined, isBrave throws, etc.) — meaning we err on
 * the side of NOT showing the warning to non-Brave users.
 */
interface BraveNavigator extends Navigator {
  brave?: { isBrave?: () => Promise<boolean> };
}

async function detectBrave(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as BraveNavigator;
  try {
    const isBrave = await nav.brave?.isBrave?.();
    return isBrave === true;
  } catch {
    return false;
  }
}

/**
 * Show the Brave-Shields warning banner inside step 6. Idempotent —
 * checks for an existing banner node before inserting.
 */
function showBraveWarning(): void {
  const step6 = $$("[data-qualifier-step]").find(
    (el) => el.getAttribute("data-qualifier-step") === "6",
  );
  if (!step6) return;
  if (step6.querySelector("[data-brave-warning]")) return; // already shown

  const banner = document.createElement("div");
  banner.setAttribute("data-brave-warning", "true");
  banner.className =
    "mb-6 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900";
  banner.innerHTML = `
    <p class="font-semibold m-0">Brave browser detected</p>
    <p class="mt-2 mb-0">
      Brave Shields blocks the spam-check widget and the form submission.
      Before you submit, click the
      <span class="font-semibold">Brave lion icon</span>
      in your address bar and toggle
      <span class="font-semibold">Shields OFF for this site</span>.
      If you submit first and the widget didn't load, a red error box
      below the spam-check will give you a Retry button.
    </p>
  `;
  // Insert at the very top of step 6's content, before the h3.
  step6.insertBefore(banner, step6.firstChild);
}

/**
 * Status of the Turnstile widget mount. Used by submitWizard() to give a
 * better error message when the widget never actually rendered (most
 * commonly because Brave Shields / a privacy extension blocked the script
 * load from challenges.cloudflare.com).
 */
type TurnstileMountStatus = "ok" | "site-key-fetch-failed" | "script-blocked" | "render-failed";
let turnstileMountStatus: TurnstileMountStatus | "pending" = "pending";

function renderTurnstileFailureBlock(reason: TurnstileMountStatus): void {
  const container = $("qualifier-turnstile");
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
    turnstileMountStatus = "pending";
    void mountTurnstileWidget();
  });
  container.appendChild(retry);
}

async function mountTurnstileWidget(): Promise<void> {
  const container = $("qualifier-turnstile");
  if (!container) return;
  if (container.hasChildNodes() && turnstileMountStatus === "ok") return; // already mounted successfully

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
    turnstileMountStatus = "site-key-fetch-failed";
    renderTurnstileFailureBlock(turnstileMountStatus);
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
      turnstileMountStatus = "script-blocked";
      renderTurnstileFailureBlock(turnstileMountStatus);
      return;
    }
  }
  // Belt-and-suspenders: in some browsers, the script "loads" successfully
  // (script.onload fires) but the window.turnstile global never appears
  // because the script body was tampered/blocked. Treat that the same as
  // a script-load failure.
  if (!window.turnstile) {
    turnstileMountStatus = "script-blocked";
    renderTurnstileFailureBlock(turnstileMountStatus);
    return;
  }

  try {
    turnstileWidgetId = window.turnstile.render(`#${container.id}`, {
      sitekey: siteKey,
      theme: "light",
      callback: (token: string) => {
        turnstileToken = token;
      },
      "error-callback": () => {
        turnstileToken = null;
      },
    });
    turnstileMountStatus = "ok";
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[discovery-qualifier] turnstile.render threw:", err);
    turnstileMountStatus = "render-failed";
    renderTurnstileFailureBlock(turnstileMountStatus);
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
      turnstileMountStatus === "ok" &&
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

  // Resume at the saved step (default 1).
  showStep((state.step || 1) as StepIndex);

  // Brave detection runs async + fire-and-forget — the banner appears
  // inside step 6 if the user is on Brave. Showing it on init (vs. only
  // when they reach step 6) is fine because the step 6 DOM is in the
  // document from the start, just hidden.
  void detectBrave().then((isBrave) => {
    if (isBrave) showBraveWarning();
  });
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
