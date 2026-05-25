/**
 * Discovery Qualifier — wizard state machine + localStorage persistence.
 *
 * Single source of truth for what step the user is on and what they've
 * answered so far. Auto-persists to localStorage so a tab refresh or
 * accidental close doesn't lose progress. State is wiped on submission
 * success.
 *
 * Attribution params (gclid, utm_*, etc.) are captured ONCE at first
 * page load and persisted separately with a 30-day TTL so they survive
 * across sessions (some visitors complete the wizard days after their
 * first landing).
 */

import type {
  QualifierAnswers,
  AttributionParams,
  ContactInfo,
  FitTier,
} from "./qualifier-types.js";

const STATE_KEY = "forge-discovery-qualifier-state";
const ATTRIBUTION_KEY = "forge-discovery-attribution";
const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type StepIndex = 1 | 2 | 3 | 4 | 5 | 6;

export interface WizardState {
  step: StepIndex;
  answers: Partial<QualifierAnswers> & {
    primarySystems?: string[];
  };
  contact: Partial<ContactInfo>;
  fromContext: string | null;
  completedAt?: number;
  computedTier?: FitTier;
}

export function emptyState(fromContext: string | null): WizardState {
  return {
    step: 1,
    answers: { primarySystems: [] },
    contact: {},
    fromContext,
  };
}

export function loadState(): WizardState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardState;
    if (typeof parsed.step !== "number" || parsed.step < 1 || parsed.step > 6) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: WizardState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded or storage disabled — silently ignore */
  }
}

export function clearState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}

/* ---- Attribution capture ---- */

interface AttributionRecord {
  capturedAt: number;
  params: AttributionParams;
}

export function captureAttribution(): AttributionParams {
  if (typeof window === "undefined") return {};
  // If we already have fresh attribution stored, return it (preserve
  // first-touch attribution across multi-session completers).
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_KEY);
    if (raw) {
      const record = JSON.parse(raw) as AttributionRecord;
      if (record.capturedAt && Date.now() - record.capturedAt < ATTRIBUTION_TTL_MS) {
        return record.params;
      }
    }
  } catch {
    /* ignore */
  }

  // Otherwise, capture fresh.
  const params = new URLSearchParams(window.location.search);
  const captured: AttributionParams = {
    gclid: params.get("gclid"),
    msclkid: params.get("msclkid"),
    fbclid: params.get("fbclid"),
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    utmContent: params.get("utm_content"),
    utmTerm: params.get("utm_term"),
    referrer: document.referrer || null,
    landingPath: window.location.pathname || null,
  };

  // Only persist if at least one ad-tracking param is present — otherwise we
  // don't need to dirty localStorage with all-null records.
  const hasAdParam = !!(
    captured.gclid ||
    captured.msclkid ||
    captured.fbclid ||
    captured.utmSource
  );
  if (hasAdParam) {
    try {
      const record: AttributionRecord = {
        capturedAt: Date.now(),
        params: captured,
      };
      window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(record));
    } catch {
      /* ignore */
    }
  }

  return captured;
}

export function clearAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ATTRIBUTION_KEY);
  } catch {
    /* ignore */
  }
}
