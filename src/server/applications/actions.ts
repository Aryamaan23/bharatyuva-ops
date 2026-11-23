"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale, type Locale } from "@/i18n/config";
import type { AnswerErrors } from "@/lib/forms/validate";
import { getSessionUser } from "@/server/auth/session";
import {
  afterSubmit,
  confirmGuardian,
  createAnswerUpload,
  createDocumentUpload,
  recordDocument,
  respondToOffer,
  setWhatsappOptIn,
  type UploadTicket,
} from "@/server/privileged/applications";
import { getCurrentEdition } from "@/server/privileged/editions";
import { rateLimit } from "@/server/privileged/rate-limit";
import { clientIpHash, userAgent } from "@/server/security/request";
import { kickDelivery } from "@/server/messaging/send";
import { saveDraft, submitApplication, type SubmitError } from "./applicant";

const uuid = z.uuid();
const answerValue = z.union([z.string().max(20000), z.array(z.string().max(500)).max(50)]);

const saveSchema = z.object({
  applicationId: uuid,
  answers: z.record(z.string().max(60), answerValue).refine((r) => Object.keys(r).length <= 200),
  step: z.number().int().min(0).max(50),
});

export type SaveDraftActionResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: "auth" | "closed" | "not_found" | "invalid" | "rateLimited"; fieldErrors?: AnswerErrors };

export async function saveDraftAction(input: z.input<typeof saveSchema>): Promise<SaveDraftActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!(await rateLimit("draftSavePerUser", user.id))) return { ok: false, error: "rateLimited" };
  const edition = await getCurrentEdition();
  if (!edition) return { ok: false, error: "closed" };

  const result = await saveDraft(user, edition, parsed.data);
  if (result.ok) return { ok: true, savedAt: new Date().toISOString() };
  return { ok: false, error: result.error, fieldErrors: result.fieldErrors };
}

const submitSchema = z.object({
  applicationId: uuid,
  locale: z.string(),
  consentProcessing: z.boolean(),
  whatsappOptIn: z.boolean(),
  age: z.enum(["adult", "minor"]).nullable(),
  guardian: z
    .object({ name: z.string().max(120), email: z.string().max(254), relation: z.string().max(60) })
    .nullable(),
});

export type SubmitActionResult = { ok: false; error: SubmitError | "auth" | "invalid"; fieldErrors?: AnswerErrors };

export async function submitApplicationAction(input: z.input<typeof submitSchema>): Promise<SubmitActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const edition = await getCurrentEdition();
  if (!edition) return { ok: false, error: "closed" };
  const locale: Locale = isLocale(parsed.data.locale) ? parsed.data.locale : "en";

  const result = await submitApplication(user, edition, {
    ...parsed.data,
    guardian: parsed.data.age === "minor" ? parsed.data.guardian : null,
    ipHash: await clientIpHash(),
    userAgent: await userAgent(),
  });
  if (!result.ok) return result;

  await afterSubmit(result.applicationId, result.guardianToken);
  redirect(`/${locale}/apply/submitted` as never);
}

const offerSchema = z.object({ applicationId: uuid, decision: z.enum(["accept", "decline"]), locale: z.string() });

export async function respondToOfferAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  const parsed = offerSchema.safeParse(Object.fromEntries(formData));
  if (!user || !parsed.success) return;
  await respondToOffer(user, parsed.data.applicationId, parsed.data.decision === "accept");
  kickDelivery(20);
  revalidatePath(`/${parsed.data.locale}/me`);
}

const whatsappSchema = z.object({ applicationId: uuid, optIn: z.enum(["true", "false"]), locale: z.string() });

export async function setWhatsappAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  const parsed = whatsappSchema.safeParse(Object.fromEntries(formData));
  if (!user || !parsed.success) return;
  await setWhatsappOptIn(user, parsed.data.applicationId, parsed.data.optIn === "true", await clientIpHash(), await userAgent());
  revalidatePath(`/${parsed.data.locale}/me`);
}

const uploadSchema = z.object({
  applicationId: uuid,
  kind: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  mime: z.string().max(100),
  size: z.number().int().positive(),
});

export async function createUploadAction(input: z.input<typeof uploadSchema>): Promise<UploadTicket | { ok: false; error: "auth" }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_file" };
  return createDocumentUpload(user, parsed.data);
}

const answerUploadSchema = z.object({
  applicationId: uuid,
  questionId: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  mime: z.string().max(100),
  size: z.number().int().positive(),
});

export async function createAnswerUploadAction(
  input: z.input<typeof answerUploadSchema>,
): Promise<UploadTicket | { ok: false; error: "auth" }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "auth" };
  const parsed = answerUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_file" };
  return createAnswerUpload(user, parsed.data);
}

const recordSchema = z.object({
  applicationId: uuid,
  kind: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  path: z.string().max(300),
  fileName: z.string().max(300),
  locale: z.string(),
});

export async function recordDocumentAction(input: z.input<typeof recordSchema>): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  const parsed = recordSchema.safeParse(input);
  if (!user || !parsed.success) return { ok: false };
  const ok = await recordDocument(user, parsed.data);
  if (ok) revalidatePath(`/${parsed.data.locale}/me`);
  return { ok };
}

const guardianSchema = z.object({ token: z.string().min(20).max(100), consent: z.literal("on"), locale: z.string() });

export async function confirmGuardianAction(formData: FormData): Promise<void> {
  const parsed = guardianSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const ok = await confirmGuardian(parsed.data.token, await clientIpHash(), await userAgent());
  const locale = isLocale(parsed.data.locale) ? parsed.data.locale : "en";
  redirect(`/${locale}/guardian/${parsed.data.token}?${ok ? "done=1" : "invalid=1"}` as never);
}

const bookSchema = z.object({ applicationId: uuid, slotId: uuid, locale: z.string() });

export async function bookInterviewAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  const parsed = bookSchema.safeParse(Object.fromEntries(formData));
  if (!user || !parsed.success) return;
  const { bookInterview } = await import("@/server/privileged/selection");
  const result = await bookInterview(user, parsed.data.applicationId, parsed.data.slotId);
  kickDelivery(20);
  const locale = isLocale(parsed.data.locale) ? parsed.data.locale : "en";
  revalidatePath(`/${locale}/me`);
  if (result === "full") redirect(`/${locale}/me?slot=full` as never);
}
