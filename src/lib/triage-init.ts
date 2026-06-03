/**
 * Triage page: single-screen lead capture + cockpit submission.
 *
 * Imported by `triage.astro` as a regular ES module (Astro/Vite bundles it
 * for the client). This is the lightweight sibling of qualifier-init.ts:
 * the discovery wizard is a 6-step, 30-minute funnel that only reveals the
 * calendar for HIGH/MEDIUM fits. The triage page is a single short form for
 * the free 15-minute call. Everyone who submits validly always gets the
 * calendar (no qualification gating).
 *
 * It reuses the discovery infrastructure where it makes sense:
 *   - captureAttribution() from qualifier-state (gclid / utm_* / referrer /
 *     landingPath, same first-touch capture)
 *   - validateEmailFormat / isPersonalEmail from qualifier-validation
 *   - the cockpit endpoint contract (/api/warm-intake/discovery-qualifier),
 *     Turnstile site-key fetch, and the clickwrap consent payload shape
 *
 * Cockpit payload note: the endpoint computes fit tier purely from
 * qualifierAnswers and requires all five answer fields plus company. The
 * triage form does NOT ask those questions (that is the whole point, it is
 * low-friction). So we send neutral, allow-list-valid defaults that classify
 * as MEDIUM, and we carry the real triage signal in `additionalNotes`:
 * a "[Quick Wins triage]" marker plus the visitor's optional free-text. That
 * marker lands in the Notion lead blob, the leads_mirror row, and the
 * #discovery-bookings Discord alert, so the lead is unmistakably tagged as a
 * Quick Wins triage even though the endpoint itself does not branch on
 * fromContext. (See the return notes in the handoff: a future cockpit change
 * could read fromContext for a first-class tag; not required to ship this.)
 */
import { captureAttribution } from "./qualifier-state.js";
import {
  validateEmailFormat,
  isPersonalEmail,
} from "./qualifier-validation.js";

/** Sales cockpit origin: discovery-qualifier endpoint + turnstile-site-key. */
const COCKPIT_ORIGIN = "https://sales.forgerpa.com";

/**
 * Clickwrap consent constants. Kept in sync with the published /terms and
 * /privacy pages (same values as qualifier-init.ts). The version strings
 * travel with the consent payload so the per-submission record references the
 * exact document versions displayed at acceptance.
 */
const TERMS_VERSION = "v1 (2026-06-01)";
const PRIVACY_VERSION = "2026-06-01";
const CONSENT_ASSENT_TEXT =
  "I have read and agree to the Terms & Conditions and Privacy Policy.";
const CONSENT_FORM_NAME = "quick_wins_triage";

/**
 * Neutral, allow-list-valid qualifier answers for the triage path. The
 * endpoint requires all five and validates each against its allow-list; we
 * are not asking these questions on the triage form, so we send defaults
 * that (a) validate and (b) classify as MEDIUM via computeFitTier:
 *   - role "Owner/Founder": not a senior-finance role (so not HIGH) and not
 *     Consultant/Other (so never DISQUALIFY)
 *   - challenge "Operational efficiency": a defined pain, not "Other"
 *   - systems ["Other"]: a valid single selection
 *   - teamSize "1-5" + a non-"Other" challenge: does NOT trip the LOW rule
 *   - timeline "This quarter": not "Just researching" (so not LOW)
 * Net result: MEDIUM. The visitor always gets the calendar regardless.
 */
const TRIAGE_DEFAULT_ANSWERS = {
  role: "Owner/Founder",
  primaryChallenge: "Operational efficiency",
  primarySystems: ["Other"],
  teamSize: "1-5",
  timeline: "This quarter",
};

/** Neutral company default: the triage form deliberately does not ask for it,
 *  but the cockpit requires a non-empty, non-URL company string. */
const TRIAGE_DEFAULT_COMPANY = "Not provided (Quick Wins triage)";

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

let turnstileWidgetId: string | null = null;
let turnstileToken: string | null = null;

const ROOT_ID = "triage-form-root";

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setError(id: string, message: string | null): void {
  const el = $(id);
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
/* Cal.com inline embed (15-minute triage event)                       */
/* ------------------------------------------------------------------ */
/*
 * Same official inline-embed approach as book.astro: auto-resizes the
 * container to fit the calendar AND the taller post-booking confirmation,
 * with name + email prefilled via the embed config.
 *
 * Event link comes from PUBLIC_CALCOM_TRIAGE_URL (the 15-min event). If it is
 * unset we fall back to the discovery-call link so the embed is never empty
 * while David is still creating the 15-min event in Cal.com.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CalApi = any;

/**
 * Resolve the Cal.com event link. Astro inlines PUBLIC_* env vars at build
 * time, so this reads the value baked into the bundle. The fallback keeps the
 * embed functional before the 15-min Triage event exists in Cal.com.
 */
function triageCalLink(): string {
  const raw = (import.meta.env.PUBLIC_CALCOM_TRIAGE_URL || "").trim();
  // Accept either a bare "owner/event" calLink or a full app.cal.com URL and
  // normalize to the "owner/event" form the inline embed expects.
  if (raw) {
    const m = raw.match(/cal\.com\/([^?#]+)/i);
    return (m ? m[1] : raw).replace(/^\/+|\/+$/g, "");
  }
  // Fallback: the existing 30-min discovery call link.
  return "david-farley/discovery-call";
}

let calEmbedLoaded = false;

function loadCalEmbed(): void {
  if (calEmbedLoaded) return;
  calEmbedLoaded = true;
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

function initCalInlineEmbed(name: string, email: string): void {
  if (calEmbedMounted) return; // mount once
  loadCalEmbed();
  const Cal = (window as unknown as { Cal?: CalApi }).Cal;
  if (typeof Cal !== "function") return;
  calEmbedMounted = true;
  Cal("inline", {
    elementOrSelector: "#triage-cal-inline",
    calLink: triageCalLink(),
    config: {
      name: name || "",
      email: email || "",
      utm_source: "forgerpa-site",
      utm_medium: "triage-page",
    },
  });
  Cal("ui", { hideEventTypeDetails: true });
}

function revealCalendar(name: string, email: string): void {
  const formCard = $("triage-form-card");
  if (formCard) formCard.classList.add("hidden");
  const success = $("triage-success");
  if (success) success.classList.remove("hidden");
  const calContainer = $("triage-cal-container");
  if (calContainer) {
    calContainer.classList.remove("hidden");
    initCalInlineEmbed(name, email);
  }
}

/* ------------------------------------------------------------------ */
/* Turnstile widget (mirror of qualifier-init.ts behavior)             */
/* ------------------------------------------------------------------ */
type TurnstileMountStatus =
  | "ok"
  | "site-key-fetch-failed"
  | "script-blocked"
  | "render-failed";
let turnstileMountStatus: TurnstileMountStatus | "pending" = "pending";

function renderTurnstileFailureBlock(reason: TurnstileMountStatus): void {
  const container = $("triage-turnstile");
  if (!container) return;
  container.innerHTML = "";
  container.classList.remove("hidden");

  const explanation =
    reason === "site-key-fetch-failed"
      ? "We couldn't reach our spam-check service. This usually means a network or privacy extension is blocking sales.forgerpa.com."
      : "Our spam-check widget didn't load. This usually means a browser shield or privacy extension is blocking challenges.cloudflare.com.";

  const help = document.createElement("div");
  help.className =
    "rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900";
  help.innerHTML = `
    <p class="font-semibold m-0">Spam-check widget didn't load</p>
    <p class="mt-2 mb-0">${explanation}</p>
    <p class="mt-2 mb-0">
      Fix: click the shield icon (Brave lion or your privacy extension) in your
      address bar and turn shields OFF for this site, then click the button below.
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
  const container = $("triage-turnstile");
  if (!container) return;
  if (container.hasChildNodes() && turnstileMountStatus === "ok") return;

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
    /* fall through to failure handling */
  }
  if (!siteKey) {
    turnstileMountStatus = "site-key-fetch-failed";
    renderTurnstileFailureBlock(turnstileMountStatus);
    return;
  }

  if (!window.turnstile) {
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
    console.error("[triage] turnstile.render threw:", err);
    turnstileMountStatus = "render-failed";
    renderTurnstileFailureBlock(turnstileMountStatus);
  }
}

/* ------------------------------------------------------------------ */
/* Submit                                                              */
/* ------------------------------------------------------------------ */
async function submitTriage(): Promise<void> {
  const nameEl = $("triage-name") as HTMLInputElement | null;
  const emailEl = $("triage-email") as HTMLInputElement | null;
  const focusEl = $("triage-focus") as HTMLTextAreaElement | null;
  const consentBox = $("triage-consent") as HTMLInputElement | null;
  const submitBtn = $("triage-submit") as HTMLButtonElement | null;

  const name = (nameEl?.value || "").trim();
  const email = (emailEl?.value || "").trim();
  const focus = (focusEl?.value || "").trim();

  setError("triage-name-error", null);
  setError("triage-email-error", null);
  setError("triage-consent-error", null);
  setError("triage-form-error", null);

  // Consent (hard stop, backstopped server-side).
  if (!consentBox || !consentBox.checked) {
    setError(
      "triage-consent-error",
      "Please confirm you have read and agree to the Terms & Conditions and Privacy Policy.",
    );
    return;
  }
  if (!name) {
    setError("triage-name-error", "Please enter your first name.");
    return;
  }
  if (!email) {
    setError("triage-email-error", "Please enter your email.");
    return;
  }
  const emailErr = validateEmailFormat(email);
  if (emailErr) {
    setError("triage-email-error", emailErr);
    return;
  }
  if (!turnstileToken) {
    const widgetActuallyMounted =
      turnstileMountStatus === "ok" &&
      window.turnstile != null &&
      turnstileWidgetId != null;
    if (!widgetActuallyMounted) {
      setError(
        "triage-form-error",
        "The spam-check widget didn't load (likely a browser shield or privacy extension). See the box above for the fix, then click 'Retry spam-check'.",
      );
    } else {
      setError(
        "triage-form-error",
        "Please complete the spam-check above, then try again.",
      );
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Booking...";
  }

  const attribution = captureAttribution();
  const personalEmailFlag = isPersonalEmail(email);

  // Carry the triage signal in additionalNotes so it lands in Notion +
  // leads_mirror + the #discovery-bookings Discord alert. The endpoint does
  // not branch on fromContext, so this marker is how the cockpit knows this
  // is a Quick Wins triage lead. We still send fromContext for forward
  // compatibility if the cockpit ever starts reading it.
  const marker = "[Quick Wins triage]";
  const additionalNotes = focus
    ? `${marker} ${focus}`
    : `${marker} (no detail provided)`;

  const payload = {
    source: "discovery_qualifier",
    name,
    email,
    company: TRIAGE_DEFAULT_COMPANY,
    additionalNotes,
    qualifierAnswers: TRIAGE_DEFAULT_ANSWERS,
    attribution,
    turnstileToken,
    fromContext: "quick-wins",
    consent: {
      consentGiven: true,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      assentText: CONSENT_ASSENT_TEXT,
      formName: CONSENT_FORM_NAME,
      clientTimestamp: new Date().toISOString(),
    },
  };
  // personalEmailFlag is informational only here (the server recomputes it);
  // reference it so the bundler does not flag an unused binding.
  void personalEmailFlag;

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
    console.error("[triage] fetch failed:", err);
    serverError =
      "Couldn't reach the booking service. If you're on Brave or a privacy browser, try lowering Shields for sales.forgerpa.com and retry.";
  }

  if (response && !serverError) {
    let parsed: { ok?: boolean; tier?: string; error?: string } | null = null;
    try {
      parsed = (await response.json()) as {
        ok?: boolean;
        tier?: string;
        error?: string;
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[triage] response parse failed:", err);
      serverError = `Booking service responded with HTTP ${response.status} (no JSON body). Please try again, or email sales@forgerpa.com.`;
    }
    if (parsed && !serverError && !response.ok) {
      serverError =
        parsed.error ||
        `Submission failed (HTTP ${response.status}). Please try again.`;
    }
  }

  if (serverError) {
    setError("triage-form-error", serverError);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Book my 15-minute call";
    }
    if (turnstileWidgetId && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId);
      turnstileToken = null;
    }
    return;
  }

  // Success: everyone gets the calendar (no qualification gating).
  revealCalendar(name, email);
}

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */
export function initTriage(): void {
  if (!$(ROOT_ID)) return; // not on /triage

  // Capture first-touch attribution as early as possible.
  captureAttribution();

  // Enable submit only when consent is checked (server backstops it).
  const consentBox = $("triage-consent") as HTMLInputElement | null;
  const submitBtn = $("triage-submit") as HTMLButtonElement | null;
  if (consentBox && submitBtn) {
    submitBtn.disabled = !consentBox.checked;
    consentBox.addEventListener("change", () => {
      submitBtn.disabled = !consentBox.checked;
      if (consentBox.checked) setError("triage-consent-error", null);
    });
  }

  submitBtn?.addEventListener("click", () => void submitTriage());

  // Mount the Turnstile widget up front (the form is single-screen, so the
  // widget is visible immediately).
  void mountTurnstileWidget();
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTriage);
  } else {
    initTriage();
  }
}
