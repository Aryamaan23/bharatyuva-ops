import { parsePhoneNumberFromString } from "libphonenumber-js/min";

/** Normalise to E.164, assuming India when no country code is given. Returns null if invalid. */
export function normalizePhone(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), "IN");
  return parsed?.isValid() ? parsed.number : null;
}

const DOT_INSENSITIVE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Canonical form used ONLY for duplicate detection (never for sending): lower-case, and for
 * Gmail, dots and "+tag" removed from the local part, so a.b+x@gmail.com == ab@gmail.com.
 */
export function canonicalEmail(input: string): string {
  const email = input.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 0) return email;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) {
    local = local.split("+")[0]!.replace(/\./g, "");
    domain = "gmail.com";
  } else {
    local = local.split("+")[0]!;
  }
  return `${local}@${domain}`;
}

/** Age in whole years on a given date (both YYYY-MM-DD). */
export function ageOn(dateOfBirth: string, on: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number) as [number, number, number];
  const [y, m, d] = on.split("-").map(Number) as [number, number, number];
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}
