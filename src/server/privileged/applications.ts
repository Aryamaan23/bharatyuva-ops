import "server-only";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import type { Locale } from "@/i18n/config";
import { isLocale } from "@/i18n/config";
import { env } from "@/lib/env";
import type { SessionUser } from "@/server/auth/session";
import { supabaseService } from "@/server/auth/supabase";
import { adminDb } from "@/server/db/admin";
import { applicants, applications, consentRecords, documents, editions, guardianConsents } from "@/server/db/schema";
import { formatDateTime, formatDayRange } from "@/server/domain/editions";
import { queueEmailAndSend } from "@/server/messaging/send";
import * as templates from "@/server/messaging/templates";
import { hashToken } from "@/server/security/crypto";
import { audit } from "./audit";
import { getCurrentConsents, getFormVersion } from "./editions";

const appUrl = () => env().NEXT_PUBLIC_APP_URL;
const asLocale = (l: string): Locale => (isLocale(l) ? l : "en");

/** Load an application only if it belongs to this signed-in user. */
async function ownedApplication(user: SessionUser, applicationId: string) {
  const [row] = await adminDb()
    .select({ application: applications, applicant: applicants, edition: editions })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .innerJoin(editions, eq(editions.id, applications.editionId))
    .where(and(eq(applications.id, applicationId), eq(applicants.userId, user.id)))
    .limit(1);
  return row ?? null;
}

/**
 * Flag (never merge) likely duplicates in the same edition: same phone number or same canonical
 * email under a different account. Admins resolve them on the application page.
 */
export async function flagDuplicates(applicationId: string): Promise<void> {
  const db = adminDb();
  const [me] = await db
    .select({ app: applications, applicant: applicants })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!me) return;

  const matchers = [eq(applicants.emailCanonical, me.applicant.emailCanonical)];
  if (me.applicant.phoneE164) matchers.push(eq(applicants.phoneE164, me.applicant.phoneE164));

  const [other] = await db
    .select({ id: applications.id, email: applicants.emailCanonical, phone: applicants.phoneE164 })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .where(
      and(
        eq(applications.editionId, me.app.editionId),
        ne(applications.id, me.app.id),
        ne(applications.status, "draft"),
        or(...matchers),
      ),
    )
    .orderBy(applications.submittedAt)
    .limit(1);
  if (!other) return;

  const reason = other.phone && other.phone === me.applicant.phoneE164 ? "same_phone" : "same_email";
  await db
    .update(applications)
    .set({ duplicateOf: other.id, duplicateReason: reason })
    .where(eq(applications.id, me.app.id));
  await audit({
    actorEmail: "system",
    action: "application.duplicate_flagged",
    entity: "application",
    entityId: me.app.id,
    after: { duplicateOf: other.id, reason },
  });
}

export async function afterSubmit(applicationId: string, guardianToken: string | null): Promise<void> {
  await flagDuplicates(applicationId);
  const [row] = await adminDb()
    .select({ app: applications, applicant: applicants, edition: editions })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .innerJoin(editions, eq(editions.id, applications.editionId))
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!row) return;
  const locale = asLocale(row.app.locale);
  const name = row.applicant.fullName ?? "";

  await audit({ actorEmail: row.applicant.email, action: "application.submitted", entity: "application", entityId: applicationId });
  await queueEmailAndSend({
    idempotencyKey: `application-received:${applicationId}`,
    to: row.applicant.email,
    template: "application_received",
    email: templates.applicationReceived(locale, {
      name,
      editionName: row.edition.name,
      portalUrl: `${appUrl()}/${locale}/me`,
    }),
    relatedEntity: "application",
    relatedId: applicationId,
  });

  if (guardianToken) {
    const [g] = await adminDb().select().from(guardianConsents).where(eq(guardianConsents.applicationId, applicationId));
    if (g) {
      await queueEmailAndSend({
        idempotencyKey: `guardian-request:${applicationId}`,
        to: g.guardianEmail,
        template: "guardian_request",
        email: templates.guardianRequest(locale, {
          guardianName: g.guardianName,
          applicantName: name,
          editionName: row.edition.name,
          confirmUrl: `${appUrl()}/${locale}/guardian/${guardianToken}`,
        }),
        relatedEntity: "application",
        relatedId: applicationId,
      });
      await adminDb().update(guardianConsents).set({ sentAt: new Date() }).where(eq(guardianConsents.id, g.id));
    }
  }
}

export async function findGuardianRequest(token: string) {
  const [row] = await adminDb()
    .select({ guardian: guardianConsents, applicantName: applicants.fullName, editionName: editions.name })
    .from(guardianConsents)
    .innerJoin(applications, eq(applications.id, guardianConsents.applicationId))
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .innerJoin(editions, eq(editions.id, applications.editionId))
    .where(eq(guardianConsents.tokenHash, hashToken(token)))
    .limit(1);
  return row ?? null;
}

export async function confirmGuardian(token: string, ipHash: string, userAgent: string | null): Promise<boolean> {
  const consents = await getCurrentConsents();
  if (!consents.guardian) return false;
  const db = adminDb();
  return db.transaction(async (tx) => {
    const [g] = await tx
      .update(guardianConsents)
      .set({ confirmedAt: new Date() })
      .where(and(eq(guardianConsents.tokenHash, hashToken(token)), isNull(guardianConsents.confirmedAt)))
      .returning();
    if (!g) return false;
    const [app] = await tx
      .update(applications)
      .set({ guardianConfirmedAt: new Date() })
      .where(eq(applications.id, g.applicationId))
      .returning({ applicantId: applications.applicantId });
    await tx.insert(consentRecords).values({
      applicantId: app!.applicantId,
      applicationId: g.applicationId,
      consentVersionId: consents.guardian!.id,
      granted: true,
      ipHash,
      userAgent,
    });
    await audit({ actorEmail: g.guardianEmail, action: "guardian.consented", entity: "application", entityId: g.applicationId });
    return true;
  });
}

export type OfferResponse = "accepted" | "declined" | "expired" | "not_found";

export async function respondToOffer(user: SessionUser, applicationId: string, accept: boolean): Promise<OfferResponse> {
  const owned = await ownedApplication(user, applicationId);
  if (!owned || owned.application.status !== "selected") return "not_found";
  const now = new Date();
  if (owned.application.seatOfferExpiresAt && owned.application.seatOfferExpiresAt < now) return "expired";

  const status = accept ? "confirmed" : "declined";
  const [updated] = await adminDb()
    .update(applications)
    .set({ status, seatRespondedAt: now })
    .where(and(eq(applications.id, applicationId), eq(applications.status, "selected")))
    .returning({ id: applications.id });
  if (!updated) return "not_found";

  await audit({
    actorEmail: user.email,
    action: accept ? "application.seat_accepted" : "application.seat_declined",
    entity: "application",
    entityId: applicationId,
    before: { status: "selected" },
    after: { status },
  });

  if (accept) {
    const locale = asLocale(owned.application.locale);
    await queueEmailAndSend({
      idempotencyKey: `seat-confirmed:${applicationId}`,
      to: owned.applicant.email,
      template: "seat_confirmed",
      email: templates.seatConfirmed(locale, {
        name: owned.applicant.fullName ?? "",
        editionName: owned.edition.name,
        dates: formatDayRange(owned.edition, locale) ?? "",
        portalUrl: `${appUrl()}/${locale}/me`,
      }),
      relatedEntity: "application",
      relatedId: applicationId,
    });
  }
  if (!accept) {
    // Offer the freed seat straight away instead of waiting for the evening job.
    const { promoteWaitlist } = await import("./selection");
    await promoteWaitlist(owned.edition.id);
  }
  return accept ? "accepted" : "declined";
}

export async function setWhatsappOptIn(
  user: SessionUser,
  applicationId: string,
  optIn: boolean,
  ipHash: string,
  userAgent: string | null,
): Promise<boolean> {
  const owned = await ownedApplication(user, applicationId);
  const consents = await getCurrentConsents();
  if (!owned || !consents.whatsapp) return false;
  await adminDb().transaction(async (tx) => {
    await tx.update(applications).set({ whatsappOptIn: optIn }).where(eq(applications.id, applicationId));
    await tx.insert(consentRecords).values({
      applicantId: owned.applicant.id,
      applicationId,
      consentVersionId: consents.whatsapp!.id,
      granted: optIn,
      ipHash,
      userAgent,
    });
  });
  await audit({
    actorEmail: user.email,
    action: optIn ? "consent.whatsapp_granted" : "consent.whatsapp_withdrawn",
    entity: "application",
    entityId: applicationId,
  });
  return true;
}

const ALLOWED_MIME = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export type UploadTicket = { ok: true; path: string; token: string } | { ok: false; error: "not_allowed" | "invalid_file" };

/**
 * Issue a short-lived signed upload URL for a document the edition asks for after selection.
 * The browser uploads straight to Storage (Vercel functions cap request bodies at 4.5 MB).
 */
export async function createDocumentUpload(
  user: SessionUser,
  input: { applicationId: string; kind: string; mime: string; size: number },
): Promise<UploadTicket> {
  const owned = await ownedApplication(user, input.applicationId);
  if (!owned || !["selected", "confirmed"].includes(owned.application.status)) return { ok: false, error: "not_allowed" };
  if (!owned.edition.postSelectionDocuments.some((d) => d.key === input.kind)) return { ok: false, error: "not_allowed" };
  const ext = ALLOWED_MIME.get(input.mime);
  if (!ext || input.size <= 0 || input.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "invalid_file" };

  const path = `${owned.edition.slug}/${input.applicationId}/${input.kind}-${Date.now()}.${ext}`;
  const { data, error } = await supabaseService().storage.from("documents").createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Storage: ${error?.message ?? "no upload URL"}`);
  return { ok: true, path: data.path, token: data.token };
}

/** Upload for a "file" question inside the application form (only while the draft is open). */
export async function createAnswerUpload(
  user: SessionUser,
  input: { applicationId: string; questionId: string; mime: string; size: number },
): Promise<UploadTicket> {
  const owned = await ownedApplication(user, input.applicationId);
  if (!owned || owned.application.status !== "draft") return { ok: false, error: "not_allowed" };
  const form = await getFormVersion(owned.edition.id, owned.application.formVersion);
  const question = form?.definition.steps.flatMap((s) => s.questions).find((q) => q.id === input.questionId);
  if (!question || question.type !== "file") return { ok: false, error: "not_allowed" };
  const ext = ALLOWED_MIME.get(input.mime);
  if (!ext || input.size <= 0 || input.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "invalid_file" };

  const path = `answers/${owned.edition.slug}/${input.applicationId}/${input.questionId}-${Date.now()}.${ext}`;
  const { data, error } = await supabaseService().storage.from("documents").createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Storage: ${error?.message ?? "no upload URL"}`);
  return { ok: true, path: data.path, token: data.token };
}

export async function recordDocument(
  user: SessionUser,
  input: { applicationId: string; kind: string; path: string; fileName: string },
): Promise<boolean> {
  const owned = await ownedApplication(user, input.applicationId);
  if (!owned) return false;
  if (!input.path.startsWith(`${owned.edition.slug}/${input.applicationId}/${input.kind}-`)) return false;

  // Confirm the object really exists and is within limits before recording it.
  const folder = input.path.slice(0, input.path.lastIndexOf("/"));
  const name = input.path.slice(input.path.lastIndexOf("/") + 1);
  const { data } = await supabaseService().storage.from("documents").list(folder, { search: name, limit: 1 });
  const obj = data?.find((o) => o.name === name);
  const size = Number((obj?.metadata as { size?: number } | undefined)?.size ?? 0);
  if (!obj || size <= 0 || size > MAX_DOCUMENT_BYTES) return false;

  await adminDb()
    .insert(documents)
    .values({
      applicationId: input.applicationId,
      kind: input.kind,
      storagePath: input.path,
      fileName: input.fileName.slice(0, 200),
      sizeBytes: size,
    })
    .onConflictDoUpdate({
      target: [documents.applicationId, documents.kind],
      set: { storagePath: input.path, fileName: input.fileName.slice(0, 200), sizeBytes: size, uploadedAt: new Date() },
    });
  await audit({ actorEmail: user.email, action: "document.uploaded", entity: "application", entityId: input.applicationId, after: { kind: input.kind } });
  return true;
}

export async function listMyDocuments(user: SessionUser, applicationId: string) {
  const owned = await ownedApplication(user, applicationId);
  if (!owned) return [];
  return adminDb()
    .select({ kind: documents.kind, fileName: documents.fileName, uploadedAt: documents.uploadedAt })
    .from(documents)
    .where(eq(documents.applicationId, applicationId));
}

export function offerDeadlineText(expiresAt: Date, locale: Locale): string {
  return formatDateTime(expiresAt, locale);
}
