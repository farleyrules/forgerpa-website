/**
 * Discovery Qualifier — types + tier classifier (frontend mirror).
 *
 * MUST stay in sync with forgerpa-sales/lib/discovery/qualifier-types.ts.
 * Server is source of truth — when the cockpit returns a tier in its
 * response, the frontend trusts that value over its own computed one.
 * Client-side classification exists for two reasons:
 *   1. UX: show the next-step screen immediately on step 6 submit without
 *      waiting for the round-trip
 *   2. Routing: decide which Step 6 contact form variant to render (some
 *      tiers skip Cal.com entirely)
 */

export interface QualifierAnswers {
  role: string;
  primaryChallenge: string;
  primarySystems: string[];
  teamSize: string;
  timeline: string;
}

export interface AttributionParams {
  gclid?: string | null;
  msclkid?: string | null;
  fbclid?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  referrer?: string | null;
  landingPath?: string | null;
}

export type FitTier = "HIGH" | "MEDIUM" | "LOW" | "DISQUALIFY";

export interface ContactInfo {
  name: string;
  email: string;
  company: string;
  phone?: string;
  linkedinUrl?: string;
}

export const ALLOWED_ROLES = [
  "Controller",
  "CFO",
  "Finance Manager",
  "Operations Manager",
  "Owner/Founder",
  "IT Leader",
  "Consultant",
  "Other",
] as const;

export const ALLOWED_CHALLENGES = [
  "Month-end close",
  "Accounts Payable",
  "Accounts Receivable",
  "Reconciliations",
  "Financial reporting",
  "Operational efficiency",
  "Data migration / ERP transition",
  "Other",
] as const;

export const ALLOWED_SYSTEMS = [
  "SAP",
  "Workday",
  "NetSuite",
  "Oracle",
  "Microsoft Dynamics",
  "Excel/Power Query",
  "Multiple ERPs",
  "Other",
] as const;

export const ALLOWED_TEAM_SIZES = ["1-5", "6-15", "16-30", "30+"] as const;

export const ALLOWED_TIMELINES = [
  "This quarter",
  "Next quarter",
  "6+ months out",
  "Just researching",
] as const;

const SENIOR_ROLES = [
  "Controller",
  "CFO",
  "Finance Manager",
  "Operations Manager",
];
const NEAR_TERM = ["This quarter", "Next quarter"];
const TARGET_SIZE = ["6-15", "16-30", "30+"];

/**
 * Optional modifiers — mirror of forgerpa-sales/lib/discovery/qualifier-types.ts.
 * `personalEmail=true` caps the result at MEDIUM (HIGH→MEDIUM; LOW and
 * DISQUALIFY unchanged). Server is authoritative; this client-side mirror
 * exists for UX-preview routing decisions (which outcome screen to show
 * before the round-trip resolves).
 */
export interface FitTierModifiers {
  personalEmail?: boolean;
}

export function computeFitTier(
  answers: QualifierAnswers,
  modifiers: FitTierModifiers = {},
): FitTier {
  if (answers.role === "Consultant") return "DISQUALIFY";
  if (answers.role === "Other" && answers.timeline === "Just researching") {
    return "DISQUALIFY";
  }
  const seniorRole = SENIOR_ROLES.includes(answers.role);
  const definedPain =
    !!answers.primaryChallenge && answers.primaryChallenge !== "Other";
  const nearTerm = NEAR_TERM.includes(answers.timeline);
  const targetSize = TARGET_SIZE.includes(answers.teamSize);
  let tier: FitTier = "MEDIUM";
  if (seniorRole && definedPain && nearTerm && targetSize) tier = "HIGH";
  else if (answers.timeline === "Just researching") tier = "LOW";
  else if (answers.teamSize === "1-5" && answers.primaryChallenge === "Other") {
    tier = "LOW";
  }
  if (modifiers.personalEmail && tier === "HIGH") return "MEDIUM";
  return tier;
}

/**
 * Pre-fill defaults derived from the `?from=` query parameter. Returns
 * `null` if the `from` value isn't recognized OR has no documented
 * pre-fill behavior. The wizard NEVER auto-skips a step — pre-fill just
 * primes the default option, user can still change it.
 */
export interface PrefillFromContext {
  challenge?: string;
  systems?: string[];
  systemsReorderToTop?: string[];
}

export function prefillFromContext(
  from: string | null,
): PrefillFromContext | null {
  if (!from) return null;
  switch (from.toLowerCase().trim()) {
    case "assessment":
      return { challenge: "Other" };
    case "sop":
      return { challenge: "Operational efficiency" };
    case "migration":
      return { challenge: "Data migration / ERP transition" };
    case "process-mining":
      return null;
    case "data-lake":
      return { systems: ["Multiple ERPs"] };
    case "month-end-close-assessment":
      return { challenge: "Month-end close" };
    case "ap-reconciliation-assessment":
      return { challenge: "Accounts Payable" };
    case "erp-handoff-assessment":
      return { systemsReorderToTop: ["Workday", "NetSuite", "SAP"] };
    case "oil-gas-diagnostic":
      return null;
    default:
      return null;
  }
}
