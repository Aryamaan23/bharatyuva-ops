/** Seats still free: total seats minus live offers and confirmed fellows. */
export function openSeats(seats: number, liveOffers: number, confirmed: number): number {
  return Math.max(0, seats - liveOffers - confirmed);
}

export function offerExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

/** The 24-hour reminder is due once, when less than a day remains on a live offer. */
export function seatReminderDue(expiresAt: Date | null, now: Date): boolean {
  if (!expiresAt) return false;
  const left = expiresAt.getTime() - now.getTime();
  return left > 0 && left <= 24 * 3600_000;
}

/** Waitlist order: rank ascending, unranked last, then by score. */
export function waitlistOrder<T extends { waitlistRank: number | null; mean: number | null }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => (a.waitlistRank ?? Number.MAX_SAFE_INTEGER) - (b.waitlistRank ?? Number.MAX_SAFE_INTEGER) || (b.mean ?? -1) - (a.mean ?? -1),
  );
}
