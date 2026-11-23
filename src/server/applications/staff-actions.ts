"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { env } from "@/lib/env";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { applicants, applications, applicationStatus, editions } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { formatDateTime } from "@/server/domain/editions";
import { queueEmailAndSend } from "@/server/messaging/send";
import * as templates from "@/server/messaging/templates";
import { audit } from "@/server/privileged/audit";

const statusSchema = z.object({
  applicationId: z.uuid(),
  status: z.enum(applicationStatus.enumValues),
  notify: z.enum(["on"]).optional(),
});

/**
 * Manual status change from the application page. Bulk decisions with previews arrive in Phase 3;
 * this is the single-application path (and how the seat-offer flow is exercised in Phase 1).
 */
export async function changeApplicationStatus(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { applicationId, status, notify } = parsed.data;

  const result = await withUserDb(session.claims, async (tx) => {
    const [row] = await tx
      .select({ app: applications, applicant: applicants, edition: editions })
      .from(applications)
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .innerJoin(editions, eq(editions.id, applications.editionId))
      .where(eq(applications.id, applicationId))
      .limit(1);
    if (!row || row.app.status === status) return null;
    const seatOfferExpiresAt =
      status === "selected" ? new Date(Date.now() + row.edition.seatConfirmHours * 3600_000) : row.app.seatOfferExpiresAt;
    await tx.update(applications).set({ status, seatOfferExpiresAt }).where(eq(applications.id, applicationId));
    return { ...row, seatOfferExpiresAt, from: row.app.status };
  });
  if (!result) return;

  await audit({
    actorEmail: session.email,
    action: "application.status_changed",
    entity: "application",
    entityId: applicationId,
    before: { status: result.from },
    after: { status, notified: Boolean(notify) },
  });

  if (notify) {
    const locale = isLocale(result.app.locale) ? result.app.locale : "en";
    const portalUrl = `${env().NEXT_PUBLIC_APP_URL}/${locale}/me`;
    const name = result.applicant.fullName ?? "";
    const email =
      status === "selected" && result.seatOfferExpiresAt
        ? templates.seatOffer(locale, {
            name,
            editionName: result.edition.name,
            expiresAt: formatDateTime(result.seatOfferExpiresAt, locale),
            portalUrl,
          })
        : templates.statusUpdate(locale, {
            name,
            editionName: result.edition.name,
            statusLabel: getDictionary(locale).portal.status[status],
            portalUrl,
          });
    await queueEmailAndSend({
      // One notification per status per application, however many times the button is clicked.
      idempotencyKey: `status:${status}:${applicationId}`,
      to: result.applicant.email,
      template: status === "selected" ? "seat_offer" : "status_update",
      email,
      relatedEntity: "application",
      relatedId: applicationId,
    });
  }
  revalidatePath(`/admin/applications/${applicationId}`);
}

export async function clearDuplicateFlag(formData: FormData): Promise<void> {
  const session = await requireStaff(ADMIN_ROLES);
  const id = z.uuid().safeParse(formData.get("applicationId"));
  if (!id.success) return;
  await withUserDb(session.claims, (tx) =>
    tx.update(applications).set({ duplicateOf: null, duplicateReason: null }).where(eq(applications.id, id.data)),
  );
  await audit({ actorEmail: session.email, action: "application.duplicate_cleared", entity: "application", entityId: id.data });
  revalidatePath(`/admin/applications/${id.data}`);
}
