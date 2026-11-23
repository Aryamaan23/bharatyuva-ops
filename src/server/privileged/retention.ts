import "server-only";
import { and, eq, inArray, lt, notExists, sql } from "drizzle-orm";
import { adminDb } from "@/server/db/admin";
import { applicants, applications, editions, outboundMessages } from "@/server/db/schema";
import { pastRetention } from "@/server/domain/passes";
import { audit } from "./audit";

const UNSUCCESSFUL = ["draft", "rejected", "withdrawn", "declined", "waitlisted", "submitted", "under_review", "shortlisted", "interview", "selected"] as const;

/**
 * Monthly DPDP retention sweep:
 *  - deletes applications that did not lead to a seat, once the edition's retention period has
 *    passed (counted from its last day); fellows who attended are kept for certificates/alumni;
 *  - deletes applicant rows left with no applications;
 *  - strips message bodies from outbox rows older than 90 days.
 */
export async function runRetentionSweep(now = new Date()) {
  const db = adminDb();
  const all = await db.select().from(editions);
  let deletedApplications = 0;
  for (const e of all) {
    const lastDay = e.day3Date ?? e.day1Date;
    if (!pastRetention(lastDay, e.retentionMonths, now)) continue;
    const gone = await db
      .delete(applications)
      .where(and(eq(applications.editionId, e.id), inArray(applications.status, [...UNSUCCESSFUL])))
      .returning({ id: applications.id });
    deletedApplications += gone.length;
    if (gone.length) await audit({ actorEmail: "system", action: "retention.applications_deleted", entity: "edition", entityId: e.id, after: { count: gone.length } });
  }
  const orphans = await db
    .delete(applicants)
    .where(notExists(db.select({ one: sql`1` }).from(applications).where(eq(applications.applicantId, applicants.id))))
    .returning({ id: applicants.id, userId: applicants.userId });
  const scrubbed = await db
    .update(outboundMessages)
    .set({ bodyHtml: null, bodyText: "[removed after 90 days]" })
    .where(and(lt(outboundMessages.createdAt, new Date(now.getTime() - 90 * 86_400_000)), sql`${outboundMessages.bodyText} <> '[removed after 90 days]'`))
    .returning({ id: outboundMessages.id });
  if (orphans.length || scrubbed.length) {
    await audit({ actorEmail: "system", action: "retention.swept", entity: "platform", entityId: null, after: { applicants: orphans.length, messages: scrubbed.length } });
  }
  return { deletedApplications, deletedApplicants: orphans.length, scrubbedMessages: scrubbed.length, orphanUserIds: orphans.map((o) => o.userId).filter(Boolean) as string[] };
}
