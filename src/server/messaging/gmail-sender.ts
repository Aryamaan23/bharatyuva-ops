import "server-only";
import { eq, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { adminDb } from "@/server/db/admin";
import { gmailThreads, outboundMessages, staffMembers } from "@/server/db/schema";
import { buildMime, type MimeAttachment } from "@/server/gmail/mime";
import { GoogleAuthError } from "@/server/gmail/oauth";
import { audit } from "@/server/privileged/audit";
import { markGmailError, senderFor } from "@/server/privileged/gmail";
import { districtLetterPdf } from "@/server/privileged/letters";
import { onOutreachSent } from "@/server/privileged/outreach";
import { decideDelivery, nextRetryDelay } from "./delivery";
import type { SendResult } from "./outbox";

type Claimed = typeof outboundMessages.$inferSelect;

/** Send one claimed outreach message through the owner's Gmail. */
export async function deliverGmail(msg: Claimed): Promise<SendResult> {
  const db = adminDb();
  const e = env();
  const senderEmail = msg.senderEmail!;
  const sender = await senderFor(senderEmail);
  if ("error" in sender) {
    // Not connected (or needs reconnecting): hold the message and try again in 6 hours.
    await db
      .update(outboundMessages)
      .set({ status: "pending", attempts: sql`${outboundMessages.attempts} - 1`, lastError: sender.error, notBefore: new Date(Date.now() + 6 * 3600_000) })
      .where(eq(outboundMessages.id, msg.id));
    return "deferred";
  }

  // Local stand-in delivers to Mailpit, so it counts as a local catcher in development.
  const decision = decideDelivery(
    {
      mode: e.MESSAGE_MODE,
      transport: sender.client.kind === "local" ? "smtp" : "resend",
      vercelEnv: e.VERCEL_ENV,
      smtpHost: e.SMTP_HOST,
      testInbox: e.TEST_INBOX,
    },
    msg.toAddress,
  );
  if (decision.action === "log") {
    await db.update(outboundMessages).set({ status: "logged", lastError: decision.reason, sentAt: new Date() }).where(eq(outboundMessages.id, msg.id));
    return "logged";
  }

  const partnershipId = typeof msg.meta.partnershipId === "string" ? msg.meta.partnershipId : null;
  const [thread] = partnershipId ? await db.select().from(gmailThreads).where(eq(gmailThreads.partnershipId, partnershipId)).limit(1) : [];
  const [staff] = await db.select({ fullName: staffMembers.fullName }).from(staffMembers).where(eq(staffMembers.email, senderEmail)).limit(1);

  try {
    const attachments: MimeAttachment[] = [];
    for (const a of msg.attachments) {
      if (a.kind === "district_letter" && a.partnershipId) {
        const letter = await districtLetterPdf(a.partnershipId);
        if (letter) attachments.push({ filename: letter.filename, contentType: "application/pdf", content: letter.pdf });
      }
    }
    const { raw, messageId } = buildMime({
      from: staff ? `${staff.fullName} <${sender.fromAddress}>` : sender.fromAddress,
      to: decision.to,
      subject: decision.subjectPrefix + (msg.subject ?? ""),
      text: msg.bodyText,
      inReplyTo: thread?.lastRfcMessageId,
      messageIdDomain: sender.fromAddress.split("@")[1] ?? "localhost",
      attachments,
    });
    const sent = await sender.client.send(raw, thread?.gmailThreadId);
    await db
      .update(outboundMessages)
      .set({ status: decision.status, providerId: sent.id, sentAt: new Date(), deliveredTo: decision.to, lastError: null })
      .where(eq(outboundMessages.id, msg.id));
    if (msg.relatedEntity === "sequence_step" && msg.relatedId && partnershipId) {
      await onOutreachSent({ stepId: msg.relatedId, partnershipId, senderEmail, gmailThreadId: sent.threadId, rfcMessageId: messageId });
    }
    await audit({ actorEmail: senderEmail, action: "message.sent", entity: "partnership", entityId: partnershipId, after: { template: msg.template, status: decision.status, messageId: msg.id } });
    return decision.status;
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 1000) : String(err);
    if (err instanceof GoogleAuthError && err.needsReconnect) {
      await markGmailError(senderEmail, error, true);
      await db
        .update(outboundMessages)
        .set({ status: "pending", attempts: sql`${outboundMessages.attempts} - 1`, lastError: "Gmail needs reconnecting", notBefore: new Date(Date.now() + 6 * 3600_000) })
        .where(eq(outboundMessages.id, msg.id));
      return "deferred";
    }
    const delay = nextRetryDelay(msg.attempts);
    await db
      .update(outboundMessages)
      .set(delay === null ? { status: "failed", lastError: error } : { status: "pending", lastError: error, notBefore: new Date(Date.now() + delay) })
      .where(eq(outboundMessages.id, msg.id));
    return delay === null ? "failed" : "retry";
  }
}
