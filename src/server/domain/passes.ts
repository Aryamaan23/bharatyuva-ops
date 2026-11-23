import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Event pass token for the QR code: "<applicationId>.<signature>". The signature stops anyone
 * forging or editing a pass; scanning still requires a signed-in staff member.
 */
export function signPass(applicationId: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(`pass:${applicationId}`).digest("base64url").slice(0, 22);
  return `${applicationId}.${sig}`;
}

export function verifyPass(token: string, secret: string): string | null {
  const [id, sig] = token.trim().split(".");
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const expected = signPass(id, secret).split(".")[1]!;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Certificate verification code, e.g. "BY27-7KQ3-M9XD". */
export function certificateCode(year: number, rand: () => number = Math.random): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join("");
  return `BY${String(year).slice(-2)}-${part()}-${part()}`;
}

/** True once an edition's retention period has passed (counted from its last day). */
export function pastRetention(lastDay: string | null, months: number, now: Date): boolean {
  if (!lastDay) return false;
  const d = new Date(`${lastDay}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return now >= d;
}
