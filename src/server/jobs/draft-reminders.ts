import "server-only";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { isLocale } from "@/i18n/config";
import { env } from "@/lib/env";
import { adminDb } from "@/server/db/admin";
import { applicants, applications, editions } from "@/server/db/schema";
import { formatDateTime } from "@/server/domain/editions";
import { draftReminderDue } from "@/server/domain/reminders";
import { enqueueEmail } from "@/server/messaging/outbox";
import * as templates from "@/server/messaging/templates";
import type { JobResult } from "./runner";

/**
 * Remind people who started but didn't submit, 48 h and 24 h before the deadline. Safe to run any
 * number of times: each reminder has a unique idempotency key in the outbox.
 */
export async function queueDraftReminders(now = new Date()): Promise<JobResult> {
  const db = adminDb();
  const open = await db
    .select()
    .from(editions)
    .where(and(isNotNull(editions.applicationsCloseAt), gt(editions.applicationsCloseAt, now)));

  let queued = 0;
  for (const edition of open) {
    const kind = draftReminderDue(edition.applicationsCloseAt!, now);
    if (!kind) continue;
    const drafts = await db
      .select({ id: applications.id, locale: applications.locale, answers: applications.answers, email: applicants.email, name: applicants.fullName })
      .from(applications)
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .where(and(eq(applications.editionId, edition.id), eq(applications.status, "draft")));

    for (const d of drafts) {
      const locale = isLocale(d.locale) ? d.locale : "en";
      const draftName = typeof d.answers.full_name === "string" ? d.answers.full_name : "";
      const id = await enqueueEmail({
        idempotencyKey: `draft-reminder:${kind}:${d.id}`,
        to: d.email,
        template: `draft_reminder_${kind}`,
        email: templates.draftReminder(locale, {
          name: d.name ?? draftName,
          editionName: edition.name,
          hoursLeft: kind === "48h" ? 48 : 24,
          deadline: formatDateTime(edition.applicationsCloseAt!, locale),
          resumeUrl: `${env().NEXT_PUBLIC_APP_URL}/${locale}/apply`,
        }),
        relatedEntity: "application",
        relatedId: d.id,
      });
      if (id) queued += 1;
    }
  }
  return { items: queued, detail: { editions: open.length } };
}
