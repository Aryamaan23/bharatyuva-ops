import "server-only";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/server/db/admin";
import { applicants, applications, outboundMessages } from "@/server/db/schema";
import { audit } from "./audit";

/**
 * Approved WhatsApp templates. Names must match templates approved in WhatsApp Manager.
 * Params fill {{1}}, {{2}}… in the approved body.
 */
export const WHATSAPP_TEMPLATES = {
  application_received: "by_application_received",
  seat_offer: "by_seat_offer",
  deadline_reminder: "by_deadline_reminder",
  status_update: "by_status_update",
} as const;

/** Queue a WhatsApp update for an application, only if the applicant opted in and has a phone. */
export async function queueWhatsapp(input: {
  applicationId: string;
  kind: keyof typeof WHATSAPP_TEMPLATES;
  params: string[];
  idempotencyKey: string;
  preview: string;
}): Promise<boolean> {
  const db = adminDb();
  const [row] = await db
    .select({ optIn: applications.whatsappOptIn, locale: applications.locale, phone: applicants.phoneE164 })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .where(eq(applications.id, input.applicationId))
    .limit(1);
  if (!row?.optIn || !row.phone) return false;
  await db
    .insert(outboundMessages)
    .values({
      channel: "whatsapp",
      idempotencyKey: input.idempotencyKey,
      toAddress: row.phone,
      bodyText: input.preview,
      template: WHATSAPP_TEMPLATES[input.kind],
      relatedEntity: "application",
      relatedId: input.applicationId,
      meta: { params: input.params, language: row.locale === "hi" ? "hi" : "en" },
    })
    .onConflictDoNothing({ target: outboundMessages.idempotencyKey });
  return true;
}

/** An inbound "STOP" withdraws WhatsApp consent for every application with that number. */
export async function whatsappOptOut(phoneE164: string): Promise<number> {
  const db = adminDb();
  const rows = await db
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .where(and(eq(applicants.phoneE164, phoneE164), eq(applications.whatsappOptIn, true)));
  for (const r of rows) {
    await db.update(applications).set({ whatsappOptIn: false }).where(eq(applications.id, r.id));
    await audit({ actorEmail: "whatsapp", action: "consent.whatsapp_withdrawn", entity: "application", entityId: r.id });
  }
  return rows.length;
}
