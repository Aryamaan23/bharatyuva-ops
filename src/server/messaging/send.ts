import "server-only";
import { after } from "next/server";
import { deliverMessage, enqueueEmail, type EnqueueEmail } from "./outbox";

/**
 * Queue an email and try to deliver it right after the response is sent. If delivery fails it
 * stays in the outbox and the drain job retries it with backoff.
 */
export async function queueEmailAndSend(msg: EnqueueEmail): Promise<void> {
  const id = await enqueueEmail(msg);
  if (id) {
    after(async () => {
      await deliverMessage(id);
    });
  }
}

/**
 * Deliver whatever is due right after this response (decisions, approvals, notifications), so
 * people don't wait for the next scheduled drain. Outside a request (tests, scripts) it's a no-op.
 */
export function kickDelivery(limit = 100): void {
  try {
    after(async () => {
      const { drainDue } = await import("./outbox");
      await drainDue(limit);
    });
  } catch {
    // No request scope: the cron drain will pick it up.
  }
}
