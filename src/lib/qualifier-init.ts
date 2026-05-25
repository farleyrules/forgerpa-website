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
  validateEmailNotFree,
  validateCompanyNotUrl,
  validatePhoneIfProvided,
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
  const fields = ["name", "email", "company", "phone", "linkedinUrl"];
  for (const field of fields) {
    const el = $(`qualifier-contact-${field}`) as HTMLInputElement | null;
    if (!el) continue;
    el.addEventListener("input", () => {
      (state.contact as Record<string, string>)[field] = el.value;
      saveState(state);
    });
  }
  $("qualifier-step6-back")?.addEventListener("click", () => showStep(5));
  $("qualifier-step6-submit")?.addEventListener("click", () => void submitWizard());
}

async function mountTurnstileWidget(): Promise<void> {
  const container = $("qualifier-turnstile");
  if (!container) return;
  if (container.hasChildNodes()) return; // already mounted

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
    /* will fall through to script-load failure handling */
  }
  if (!siteKey) {
    container.textContent =
      "(Couldn't load spam-check widget — please try refreshing the page.)";
    container.classList.remove("hidden");
    return;
  }

  // Load Turnstile script if not yet loaded.
  if (!window.turnstile) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(
        'script[src*="challenges.cloudflare.com/turnstile"]',
      );
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("turnstile-script-error")));
        return;
      }
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("turnstile-script-error"));
      document.head.appendChild(script);
    }).catch(() => {
      container.textContent =
        "(Spam-check widget unavailable — please try refreshing the page.)";
    });
  }
  if (!window.turnstile) return;

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
}

async function submitWizard(): Promise<void> {
  const contact = state.contact;
  const name = (contact.name || "").trim();
  const email = (contact.email || "").trim();
  const company = (contact.company || "").trim();
  const phone = (contact.phone || "").trim();
  const linkedinUrl = (contact.linkedinUrl || "").trim();

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
  const emailErr = validateEmailNotFree(email);
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
    setError(
      "qualifier-step6",
      "Please complete the spam-check above, then try again.",
    );
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
  const payload = {
    source: "discovery_qualifier",
    name,
    email,
    company,
    phone: phone || undefined,
    linkedinUrl: linkedinUrl || undefined,
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
  try {
    const response = await fetch(
      `${COCKPIT_ORIGIN}/api/warm-intake/discovery-qualifier`,
      {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const json = (await response.json()) as { tier?: FitTier; error?: string };
    if (response.ok && json.tier) {
      serverTier = json.tier;
    } else {
      serverError = json.error || "Submission failed. Please try again.";
    }
  } catch {
    serverError = "Couldn't reach the booking service. Please try again in a moment.";
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
  for (const f of ["name", "email", "company", "phone", "linkedinUrl"] as const) {
    const v = (state.contact as Record<string, string | undefined>)[f];
    if (v) {
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
