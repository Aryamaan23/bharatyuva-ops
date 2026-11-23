export type MessageMode = "log" | "redirect" | "live";
export type EmailTransport = "resend" | "smtp";

export type DeliveryConfig = {
  mode: MessageMode;
  transport: EmailTransport;
  vercelEnv: "development" | "preview" | "production" | undefined;
  smtpHost: string;
  testInbox: string | undefined;
};

export type DeliveryDecision =
  | { action: "send"; to: string; subjectPrefix: string; status: "sent" | "redirected" }
  | { action: "log"; reason: string };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "mailpit", "inbucket"]);

/**
 * Decide where a message really goes. Real recipients are only ever contacted when
 * VERCEL_ENV=production and MESSAGE_MODE=live. The single exception is SMTP to a local catcher
 * (Mailpit), which cannot leave the developer's machine.
 */
export function decideDelivery(cfg: DeliveryConfig, to: string): DeliveryDecision {
  const localCatcher = cfg.transport === "smtp" && LOCAL_HOSTS.has(cfg.smtpHost) && cfg.vercelEnv === undefined;

  let mode = cfg.mode;
  if (mode === "live" && cfg.vercelEnv !== "production" && !localCatcher) mode = "redirect";

  if (mode === "log") return { action: "log", reason: "MESSAGE_MODE=log" };
  if (mode === "live") return { action: "send", to, subjectPrefix: "", status: "sent" };

  if (!cfg.testInbox) return { action: "log", reason: "redirect mode without TEST_INBOX" };
  return { action: "send", to: cfg.testInbox, subjectPrefix: `[to: ${to}] `, status: "redirected" };
}

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** Delay before the next attempt after `attempts` failures, or null when we should give up. */
export function nextRetryDelay(attempts: number): number | null {
  return attempts >= MAX_ATTEMPTS ? null : (RETRY_DELAYS_MS[attempts - 1] ?? null);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Start of the current day in IST, as a UTC Date. Daily caps reset at IST midnight. */
export function startOfIstDay(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

export function startOfNextIstDay(now: Date): Date {
  return new Date(startOfIstDay(now).getTime() + 24 * 60 * 60 * 1000);
}
