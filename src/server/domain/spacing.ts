/**
 * Random gaps between outreach sends so a staff mailbox never fires a burst (which looks like
 * spam). Returns send times for `count` messages starting no earlier than `start`.
 */
export function spacedSendTimes(count: number, start: Date, rand: () => number = Math.random, minMinutes = 3, maxMinutes = 8): Date[] {
  const times: Date[] = [];
  let t = start.getTime();
  for (let i = 0; i < count; i++) {
    if (i > 0) t += Math.round((minMinutes + rand() * (maxMinutes - minMinutes)) * 60_000);
    times.push(new Date(t));
  }
  return times;
}

/** How many more emails this sender may queue today. */
export function remainingCap(dailyCap: number, alreadyScheduledToday: number): number {
  return Math.max(0, dailyCap - alreadyScheduledToday);
}
