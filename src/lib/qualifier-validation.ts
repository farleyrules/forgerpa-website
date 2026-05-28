/**
 * Client-side spam validators for the Discovery Qualifier.
 *
 * MUST be a strict subset of the server-side rules in
 * forgerpa-sales/lib/spam/validators.ts. Server is authoritative —
 * client-side validation exists for immediate UX feedback only.
 * Anything that passes the client MAY still be rejected by the server.
 */

export const FREE_EMAIL_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "yandex.com",
  "fastmail.com",
];

const COMPANY_URL_FRAGMENTS = [
  "http",
  "https",
  "://",
  ".com",
  ".net",
  ".org",
  ".io",
  ".online",
  ".xyz",
  ".info",
  ".biz",
  ".co",
];

const COMPANY_ALLOWED_SUFFIXES = [
  ", inc.",
  ", inc",
  ", co.",
  ", co",
  ", llc",
  ", l.l.c.",
  ", ltd.",
  ", ltd",
];

const TEST_NUMBERS = ["1234567890", "5555555555", "0000000000"];

/**
 * Detect "555 exchange" fictional NANP numbers. North American carriers
 * never assign 555-XXXX subscriber numbers (formally 555-0100..0199 per
 * FCC reservation; informally all 555-XXXX is treated as fictional in
 * media + tests). Also catches the impossible "555" area code.
 *
 * Strips non-digits, normalizes a leading "1" (US/Canada country code),
 * then inspects the 10-digit NPA-NXX-XXXX layout.
 */
function isFictional555(digits: string): boolean {
  const norm =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (norm.length !== 10) return false;
  // Exchange (middle 3 digits) — positions 3..6 in NPA-NXX-XXXX.
  if (norm.substring(3, 6) === "555") return true;
  // Area code "555" — no real NANP NPA starts with 555.
  if (norm.substring(0, 3) === "555") return true;
  return false;
}

/**
 * Validate email format. Returns null on success, error string on failure.
 *
 * Policy update 2026-05-25: this validator NO LONGER rejects free-email
 * domains. The cockpit backend treats free-email as a tier modifier
 * (caps HIGH at MEDIUM) rather than a hard reject — SMB owners legitimately
 * use gmail / yahoo / icloud as their work email. See
 * forgerpa-sales/lib/spam/validators.ts for the server-side change.
 */
export function validateEmailFormat(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return "Please enter your email address.";
  const atIdx = trimmed.lastIndexOf("@");
  if (atIdx < 1 || atIdx === trimmed.length - 1) {
    return "Please enter a valid email address.";
  }
  // Basic TLD-shape check — at least one '.' after the '@'.
  if (!trimmed.slice(atIdx + 1).includes(".")) {
    return "Please enter a valid email address.";
  }
  return null;
}

/** True if the email's domain is on the personal-email list. */
export function isPersonalEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const atIdx = trimmed.lastIndexOf("@");
  if (atIdx < 1) return false;
  const domain = trimmed.slice(atIdx + 1);
  return FREE_EMAIL_DOMAINS.includes(domain);
}

/**
 * @deprecated 2026-05-25 — use `validateEmailFormat` + `isPersonalEmail`.
 * This shim keeps the old name working for any in-flight callers; the
 * free-email branch has been removed (now never returns a domain error,
 * only format errors).
 */
export function validateEmailNotFree(email: string): string | null {
  return validateEmailFormat(email);
}

/**
 * Reject company-name fields that look like URLs. Allow trailing
 * corporate suffixes (", Inc.") which legitimately contain dots.
 */
export function validateCompanyNotUrl(company: string): string | null {
  const trimmed = company.trim();
  if (!trimmed) return "Company name is required.";
  let normalized = trimmed.toLowerCase();
  for (const suffix of COMPANY_ALLOWED_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }
  for (const fragment of COMPANY_URL_FRAGMENTS) {
    if (normalized.includes(fragment)) {
      return "Company name should be your organization's name, not a website or link.";
    }
  }
  return null;
}

/**
 * Format a phone number to the canonical US `NNN-NNN-NNNN` shape as the
 * user types. Idempotent — if the input is already partially formatted
 * (or pasted as `(214) 578-1717`), we strip non-digits before reformatting.
 * Caps at 10 digits (US format); excess digits are dropped silently.
 *
 * Used by the step-6 phone input's `input` event handler so the field
 * always renders the formatted value back to the user.
 */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Phone is OPTIONAL. Return null if empty OR if it passes basic format
 * + isn't an obvious test number. Return an error string otherwise.
 */
export function validatePhoneIfProvided(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return "Please enter a valid phone number, or leave this field blank.";
  if (digits.length > 15) return "Please enter a valid phone number, or leave this field blank.";
  if (TEST_NUMBERS.includes(digits)) {
    return "Please enter a valid phone number, or leave this field blank.";
  }
  if (isFictional555(digits)) {
    return "That looks like a fictional 555-prefix number. Please enter a real phone number, or leave this field blank.";
  }
  return null;
}
