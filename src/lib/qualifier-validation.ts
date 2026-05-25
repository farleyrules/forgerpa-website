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

const FCC_FICTIONAL_RE = /\b555-?01[0-9]{2}\b/;
const TEST_NUMBERS = ["1234567890", "5555555555", "0000000000"];

export function validateEmailNotFree(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return "Please enter your work email address.";
  const atIdx = trimmed.lastIndexOf("@");
  if (atIdx < 1 || atIdx === trimmed.length - 1) {
    return "Please enter a valid email address.";
  }
  const domain = trimmed.slice(atIdx + 1);
  if (FREE_EMAIL_DOMAINS.includes(domain)) {
    return "Please use your work email address. Personal email accounts aren't supported for our discovery calls.";
  }
  return null;
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
  if (FCC_FICTIONAL_RE.test(trimmed)) {
    return "Please enter a valid phone number, or leave this field blank.";
  }
  return null;
}
