/** Only allow redirects to paths on our own origin (prevents open redirects via ?next=). */
export function safeNextPath(next: string | null | undefined, appUrl: string, fallback = "/"): string {
  if (!next) return fallback;
  try {
    const base = new URL(appUrl);
    const target = new URL(next, base);
    if (target.origin !== base.origin) return fallback;
    const path = `${target.pathname}${target.search}`;
    return path.startsWith("//") ? fallback : path;
  } catch {
    return fallback;
  }
}
