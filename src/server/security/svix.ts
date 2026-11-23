import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify a Svix-signed webhook (Resend uses Svix). Returns false on any mismatch or stale timestamp. */
export function verifySvix(input: { secret: string; id: string; timestamp: string; signature: string; body: string; nowSeconds?: number; toleranceSeconds?: number }): boolean {
  const now = input.nowSeconds ?? Date.now() / 1000;
  if (!input.id || !input.timestamp || Math.abs(now - Number(input.timestamp)) > (input.toleranceSeconds ?? 300)) return false;
  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  const expected = Buffer.from(createHmac("sha256", key).update(`${input.id}.${input.timestamp}.${input.body}`).digest("base64"));
  return input.signature.split(" ").some((part) => {
    const got = Buffer.from(part.replace(/^v1,/, ""));
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
