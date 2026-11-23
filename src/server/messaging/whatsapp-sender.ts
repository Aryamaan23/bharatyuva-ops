import "server-only";
import { eq, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { adminDb } from "@/server/db/admin";
import { outboundMessages } from "@/server/db/schema";
import { whatsappProvider } from "@/server/whatsapp/provider";
import { nextRetryDelay } from "./delivery";
import type { SendResult } from "./outbox";

type Claimed = typeof outboundMessages.$inferSelect;

export async function deliverWhatsapp(msg: Claimed): Promise<SendResult> {
  const db = adminDb();
  if (!env().FEATURE_WHATSAPP) {
    await db.update(outboundMessages).set({ status: "logged", lastError: "FEATURE_WHATSAPP is off", sentAt: new Date() }).where(eq(outboundMessages.id, msg.id));
    return "logged";
  }
  const provider = whatsappProvider();
  try {
    const params = Array.isArray(msg.meta.params) ? msg.meta.params.map(String) : [];
    const { id } = await provider.sendTemplate({
      to: msg.toAddress,
      template: msg.template,
      language: msg.meta.language === "hi" ? "hi" : "en",
      params,
    });
    const status = provider.name === "console" ? "logged" : "sent";
    await db.update(outboundMessages).set({ status, providerId: id, sentAt: new Date(), deliveredTo: msg.toAddress }).where(eq(outboundMessages.id, msg.id));
    return status;
  } catch (err) {
    const delay = nextRetryDelay(msg.attempts);
    await db
      .update(outboundMessages)
      .set({
        status: delay === null ? "failed" : "pending",
        lastError: err instanceof Error ? err.message.slice(0, 500) : String(err),
        notBefore: delay === null ? undefined : new Date(Date.now() + delay),
        attempts: sql`${outboundMessages.attempts}`,
      })
      .where(eq(outboundMessages.id, msg.id));
    return delay === null ? "failed" : "retry";
  }
}
