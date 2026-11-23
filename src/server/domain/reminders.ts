const HOUR = 60 * 60 * 1000;

export type DraftReminderKind = "48h" | "24h";

/**
 * Which "you haven't submitted yet" reminder (if any) is due, given the deadline and the time the
 * daily 18:00 IST job runs. Windows are exclusive of each other, and the outbox idempotency key
 * (`draft-reminder:<kind>:<applicationId>`) guarantees each is sent at most once even if the job
 * runs twice or Vercel fires it late.
 */
export function draftReminderDue(closeAt: Date, now: Date): DraftReminderKind | null {
  const remaining = closeAt.getTime() - now.getTime();
  if (remaining <= 0) return null;
  if (remaining <= 24 * HOUR) return "24h";
  if (remaining <= 48 * HOUR) return "48h";
  return null;
}
