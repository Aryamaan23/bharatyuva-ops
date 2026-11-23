import "server-only";
import { eq } from "drizzle-orm";
import { adminDb } from "@/server/db/admin";
import { messageEvents, outboundMessages } from "@/server/db/schema";

/** Record a provider event (delivered, bounced, read…) against the outbox row it belongs to. */
export async function recordMessageEvent(input: { providerId: string; kind: string; raw: unknown }) {
  const db = adminDb();
  const [msg] = await db.select({ id: outboundMessages.id }).from(outboundMessages).where(eq(outboundMessages.providerId, input.providerId)).limit(1);
  await db
    .insert(messageEvents)
    .values({ outboundMessageId: msg?.id ?? null, providerId: input.providerId, kind: input.kind, raw: input.raw as object })
    .onConflictDoNothing();
}
