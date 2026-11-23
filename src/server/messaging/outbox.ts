import "server-only";
import { and, count, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { adminDb } from "@/server/db/admin";
import { outboundMessages } from "@/server/db/schema";
import { audit } from "@/server/privileged/audit";
import { decideDelivery, nextRetryDelay, startOfIstDay, startOfNextIstDay } from "./delivery";
import { emailTransport } from "./transports";

export type EnqueueEmail = {
  idempotencyKey: string;
  to: string;
  template: string;
  email: { subject: string; html: string | null; text: string };
  relatedEntity?: string;
  relatedId?: string;
  notBefore?: Date;
};

/**
 * Queue an email. Returns the message id, or null if a message with this idempotency key already
 * exists (i.e. it was queued before: the caller must not treat that as an error).
 */
export async function enqueueEmail(msg: EnqueueEmail): Promise<string | null> {
  const [row] = await adminDb()
    .insert(outboundMessages)
    .values({
      channel: "email",
      idempotencyKey: msg.idempotencyKey,
      toAddress: msg.to.trim().toLowerCase(),
      subject: msg.email.subject,
      bodyHtml: msg.email.html,
      bodyText: msg.email.text,
      template: msg.template,
      relatedEntity: msg.relatedEntity,
      relatedId: msg.relatedId,
      notBefore: msg.notBefore ?? new Date(),
    })
    .onConflictDoNothing({ target: outboundMessages.idempotencyKey })
    .returning({ id: outboundMessages.id });
  return row?.id ?? null;
}

/** Atomically claim one due message so two drainers can never send it twice. */
async function claim(id: string) {
  const [row] = await adminDb()
    .update(outboundMessages)
    .set({ status: "sending", attempts: sql`${outboundMessages.attempts} + 1` })
    .where(
      and(eq(outboundMessages.id, id), eq(outboundMessages.status, "pending"), lte(outboundMessages.notBefore, new Date())),
    )
    .returning();
  return row ?? null;
}

async function sentTodayCount(now: Date): Promise<number> {
  const [row] = await adminDb()
    .select({ n: count() })
    .from(outboundMessages)
    .where(
      and(
        eq(outboundMessages.channel, "email"),
        inArray(outboundMessages.status, ["sent", "redirected"]),
        gte(outboundMessages.sentAt, startOfIstDay(now)),
      ),
    );
  return row?.n ?? 0;
}

export type SendResult = "sent" | "redirected" | "logged" | "deferred" | "retry" | "failed" | "skipped";

export async function deliverMessage(id: string, now = new Date()): Promise<SendResult> {
  const msg = await claim(id);
  if (!msg) return "skipped";
  const e = env();
  const db = adminDb();

  if (msg.channel === "gmail") {
    const { deliverGmail } = await import("./gmail-sender");
    return deliverGmail(msg);
  }
  if (msg.channel === "whatsapp") {
    const { deliverWhatsapp } = await import("./whatsapp-sender");
    return deliverWhatsapp(msg);
  }

  const decision = decideDelivery(
    {
      mode: e.MESSAGE_MODE,
      transport: e.EMAIL_TRANSPORT,
      vercelEnv: e.VERCEL_ENV,
      smtpHost: e.SMTP_HOST,
      testInbox: e.TEST_INBOX,
    },
    msg.toAddress,
  );

  if (decision.action === "log") {
    await db
      .update(outboundMessages)
      .set({ status: "logged", lastError: decision.reason, sentAt: now })
      .where(eq(outboundMessages.id, id));
    return "logged";
  }

  if (e.EMAIL_TRANSPORT === "resend" && (await sentTodayCount(now)) >= e.RESEND_DAILY_CAP) {
    await db
      .update(outboundMessages)
      .set({
        status: "pending",
        attempts: sql`${outboundMessages.attempts} - 1`,
        notBefore: new Date(startOfNextIstDay(now).getTime() + 5 * 60_000),
        lastError: "Daily email cap reached; deferred to tomorrow",
      })
      .where(eq(outboundMessages.id, id));
    return "deferred";
  }

  try {
    const { providerId } = await emailTransport().send({
      to: decision.to,
      subject: decision.subjectPrefix + (msg.subject ?? ""),
      html: msg.bodyHtml,
      text: msg.bodyText,
      idempotencyKey: msg.idempotencyKey,
    });
    await db
      .update(outboundMessages)
      .set({ status: decision.status, providerId, sentAt: new Date(), deliveredTo: decision.to, lastError: null })
      .where(eq(outboundMessages.id, id));
    await audit({
      actorEmail: "system",
      action: "message.sent",
      entity: msg.relatedEntity ?? "outbound_message",
      entityId: msg.relatedId ?? msg.id,
      after: { template: msg.template, status: decision.status, messageId: msg.id },
    });
    return decision.status;
  } catch (err) {
    const delay = nextRetryDelay(msg.attempts);
    const error = err instanceof Error ? err.message.slice(0, 1000) : String(err);
    await db
      .update(outboundMessages)
      .set(
        delay === null
          ? { status: "failed", lastError: error }
          : { status: "pending", lastError: error, notBefore: new Date(Date.now() + delay) },
      )
      .where(eq(outboundMessages.id, id));
    return delay === null ? "failed" : "retry";
  }
}

/** Send every due message (batched). Also releases rows stuck in "sending" after a crash. */
export async function drainDue(limit = 50): Promise<Record<SendResult, number>> {
  const db = adminDb();
  await db
    .update(outboundMessages)
    .set({ status: "pending" })
    .where(and(eq(outboundMessages.status, "sending"), lt(outboundMessages.updatedAt, new Date(Date.now() - 10 * 60_000))));

  const due = await db
    .select({ id: outboundMessages.id })
    .from(outboundMessages)
    .where(
      and(
        eq(outboundMessages.status, "pending"),
        lte(outboundMessages.notBefore, new Date()),
      ),
    )
    .orderBy(outboundMessages.notBefore)
    .limit(limit);

  const tally: Record<SendResult, number> = {
    sent: 0,
    redirected: 0,
    logged: 0,
    deferred: 0,
    retry: 0,
    failed: 0,
    skipped: 0,
  };
  for (const { id } of due) tally[await deliverMessage(id)] += 1;
  return tally;
}
