import "server-only";
import { sql } from "drizzle-orm";
import { adminDb } from "@/server/db/admin";

export const LIMITS = {
  magicLinkPerEmail: { max: 3, windowSeconds: 15 * 60 },
  // Generous: a whole college campus can share one IP on its Wi-Fi. Turnstile stops bots.
  magicLinkPerIp: { max: 60, windowSeconds: 60 * 60 },
  applyStartPerIp: { max: 5, windowSeconds: 60 * 60 },
  dataRequestPerIp: { max: 5, windowSeconds: 60 * 60 },
  draftSavePerUser: { max: 120, windowSeconds: 60 * 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

/** Returns true when allowed. Backed by app_private.rate_limit (fixed window, in Postgres). */
export async function rateLimit(name: LimitName, subject: string): Promise<boolean> {
  const { max, windowSeconds } = LIMITS[name];
  const rows = await adminDb().execute<{ allowed: boolean }>(
    sql`select app_private.rate_limit(${`${name}:${subject}`}, ${max}, ${windowSeconds}) as allowed`,
  );
  return rows[0]?.allowed === true;
}
