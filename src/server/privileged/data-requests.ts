import "server-only";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import type { Locale } from "@/i18n/config";
import { env } from "@/lib/env";
import { supabaseService } from "@/server/auth/supabase";
import { adminDb } from "@/server/db/admin";
import { applicants, applications, consentRecords, deletionRequests, documents, outboundMessages } from "@/server/db/schema";
import { queueEmailAndSend } from "@/server/messaging/send";
import * as templates from "@/server/messaging/templates";
import { hashToken, hashValue, newToken } from "@/server/security/crypto";
import { audit } from "./audit";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Record a data request and email a confirmation link. The response to the visitor is the same
 * whether or not we hold data for the address, so the form can't be used to discover applicants.
 */
export async function createDataRequest(input: {
  email: string;
  kind: "delete" | "access";
  reason: string | null;
  locale: Locale;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const [known] = await adminDb().select({ id: applicants.id }).from(applicants).where(eq(applicants.email, email)).limit(1);
  if (!known) return;

  const token = newToken();
  const [row] = await adminDb()
    .insert(deletionRequests)
    .values({
      email,
      emailHash: hashValue(email),
      kind: input.kind,
      reason: input.reason?.slice(0, 1000) ?? null,
      tokenHash: hashToken(token),
    })
    .returning({ id: deletionRequests.id });

  await queueEmailAndSend({
    idempotencyKey: `data-request-verify:${row!.id}`,
    to: email,
    template: "data_request_verify",
    email: templates.dataRequestVerify(input.locale, {
      kind: input.kind,
      confirmUrl: `${env().NEXT_PUBLIC_APP_URL}/${input.locale}/data-request/confirm/${token}`,
    }),
    relatedEntity: "deletion_request",
    relatedId: row!.id,
  });
}

export async function verifyDataRequest(token: string): Promise<boolean> {
  const [row] = await adminDb()
    .select()
    .from(deletionRequests)
    .where(eq(deletionRequests.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return false;
  if (row.status !== "pending_verification") return row.status === "verified" || row.status === "completed";
  if (Date.now() - row.createdAt.getTime() > TOKEN_TTL_MS) return false;
  await adminDb()
    .update(deletionRequests)
    .set({ status: "verified", verifiedAt: new Date() })
    .where(eq(deletionRequests.id, row.id));
  await audit({ actorEmail: row.email, action: "data_request.verified", entity: "deletion_request", entityId: row.id });
  return true;
}

export async function listDataRequests() {
  return adminDb().select().from(deletionRequests).orderBy(desc(deletionRequests.createdAt)).limit(200);
}

/**
 * Erase everything we hold for the applicant: applications (cascade: consents, guardian rows,
 * document rows), storage files, queued messages, the applicant row and their auth account.
 * Keeps only the hashed email on the request as proof. Admin-only; caller must check the role.
 */
export async function completeDeletion(requestId: string, actorEmail: string): Promise<"done" | "not_found"> {
  const db = adminDb();
  const [req] = await db.select().from(deletionRequests).where(eq(deletionRequests.id, requestId)).limit(1);
  if (!req || req.status !== "verified" || !req.email) return "not_found";
  const email = req.email;
  const locale: Locale = "en";

  const [applicant] = await db.select().from(applicants).where(eq(applicants.email, email)).limit(1);
  if (applicant) {
    const apps = await db.select({ id: applications.id }).from(applications).where(eq(applications.applicantId, applicant.id));
    const appIds = apps.map((a) => a.id);
    if (appIds.length) {
      const docs = await db.select({ path: documents.storagePath }).from(documents).where(inArray(documents.applicationId, appIds));
      const storage = supabaseService().storage.from("documents");
      // Answer uploads live under answers/<edition-slug>/<applicationId>/.
      const answerFiles: string[] = [];
      const { data: editionDirs } = await storage.list("answers");
      for (const dir of editionDirs ?? []) {
        for (const id of appIds) {
          const { data: files } = await storage.list(`answers/${dir.name}/${id}`);
          for (const f of files ?? []) answerFiles.push(`answers/${dir.name}/${id}/${f.name}`);
        }
      }
      const paths = [...docs.map((d) => d.path), ...answerFiles];
      if (paths.length) await storage.remove(paths);
      await db
        .update(outboundMessages)
        .set({ status: "cancelled" })
        .where(and(inArray(outboundMessages.relatedId, appIds), eq(outboundMessages.status, "pending")));
    }
    await db.delete(applicants).where(eq(applicants.id, applicant.id));
    if (applicant.userId) await supabaseService().auth.admin.deleteUser(applicant.userId);
  }
  // Scrub the address from past message copies too.
  await db
    .update(outboundMessages)
    .set({ toAddress: "deleted", bodyHtml: null, bodyText: "[deleted on request]", deliveredTo: null })
    .where(like(outboundMessages.toAddress, email));

  // Send the completion notice before forgetting the address.
  await queueEmailAndSend({
    idempotencyKey: `data-request-done:${req.id}`,
    to: email,
    template: "data_request_completed",
    email: templates.dataRequestCompleted(locale, { kind: "delete" }),
    relatedEntity: "deletion_request",
    relatedId: req.id,
  });
  await db
    .update(deletionRequests)
    .set({ status: "completed", email: null, processedBy: actorEmail, processedAt: new Date() })
    .where(eq(deletionRequests.id, req.id));
  await audit({ actorEmail, action: "data_request.deleted", entity: "deletion_request", entityId: req.id });
  return "done";
}

/** Everything we hold for a verified access request, as JSON. Admin-only; logged by the caller. */
export async function exportApplicantData(requestId: string) {
  const db = adminDb();
  const [req] = await db.select().from(deletionRequests).where(eq(deletionRequests.id, requestId)).limit(1);
  if (!req?.email || req.status !== "verified") return null;
  const [applicant] = await db.select().from(applicants).where(eq(applicants.email, req.email)).limit(1);
  if (!applicant) return { email: req.email, applicant: null, applications: [], consents: [] };
  const apps = await db.select().from(applications).where(eq(applications.applicantId, applicant.id));
  const consents = await db.select().from(consentRecords).where(eq(consentRecords.applicantId, applicant.id));
  return {
    exportedAt: new Date().toISOString(),
    applicant: { ...applicant, userId: undefined },
    applications: apps.map((a) => ({ ...a, applicantId: undefined })),
    consents: consents.map((c) => ({ consentVersionId: c.consentVersionId, granted: c.granted, recordedAt: c.recordedAt })),
  };
}

export async function markAccessRequestDone(requestId: string, actorEmail: string): Promise<void> {
  const [req] = await adminDb().select().from(deletionRequests).where(eq(deletionRequests.id, requestId)).limit(1);
  if (!req?.email || req.status !== "verified") return;
  await queueEmailAndSend({
    idempotencyKey: `data-request-done:${req.id}`,
    to: req.email,
    template: "data_request_completed",
    email: templates.dataRequestCompleted("en", { kind: "access" }),
    relatedEntity: "deletion_request",
    relatedId: req.id,
  });
  await adminDb()
    .update(deletionRequests)
    .set({ status: "completed", processedBy: actorEmail, processedAt: new Date() })
    .where(eq(deletionRequests.id, req.id));
  await audit({ actorEmail, action: "data_request.access_completed", entity: "deletion_request", entityId: req.id });
}

export async function rejectDataRequest(requestId: string, actorEmail: string, notes: string): Promise<void> {
  await adminDb()
    .update(deletionRequests)
    .set({ status: "rejected", email: null, processedBy: actorEmail, processedAt: new Date(), notes: notes.slice(0, 1000) })
    .where(eq(deletionRequests.id, requestId));
  await audit({ actorEmail, action: "data_request.rejected", entity: "deletion_request", entityId: requestId });
}
