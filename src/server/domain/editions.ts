export type ApplicationWindow = "open" | "not_open" | "closed";

export function applicationWindow(
  edition: { applicationsOpenAt: Date | null; applicationsCloseAt: Date | null },
  now: Date,
): ApplicationWindow {
  if (!edition.applicationsOpenAt || now < edition.applicationsOpenAt) return "not_open";
  if (edition.applicationsCloseAt && now >= edition.applicationsCloseAt) return "closed";
  return "open";
}

/** Whole days from `now` until `date` (YYYY-MM-DD, interpreted in IST). Negative once past. */
export function daysUntil(date: string, now: Date): number {
  const target = new Date(`${date}T00:00:00+05:30`).getTime();
  const todayIst = new Date(now.getTime() + 5.5 * 3600_000);
  todayIst.setUTCHours(0, 0, 0, 0);
  const today = todayIst.getTime() - 5.5 * 3600_000;
  return Math.round((target - today) / 86_400_000);
}

const IST = "Asia/Kolkata";

export function formatDate(d: Date | string, locale: "en" | "hi" = "en"): string {
  const date = typeof d === "string" ? new Date(`${d}T00:00:00+05:30`) : d;
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: IST,
  }).format(date);
}

export function formatDateTime(d: Date, locale: "en" | "hi" = "en"): string {
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: IST,
    timeZoneName: "short",
  }).format(d);
}

/** "12–14 March 2027" style range for the three days, or null if dates aren't set. */
export function formatDayRange(
  e: { day1Date: string | null; day3Date: string | null },
  locale: "en" | "hi" = "en",
): string | null {
  if (!e.day1Date) return null;
  if (!e.day3Date || e.day3Date === e.day1Date) return formatDate(e.day1Date, locale);
  return `${formatDate(e.day1Date, locale)} – ${formatDate(e.day3Date, locale)}`;
}
