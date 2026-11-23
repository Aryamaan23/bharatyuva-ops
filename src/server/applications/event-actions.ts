"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { getSessionUser } from "@/server/auth/session";
import { createSubmissionUpload, recordSubmission, saveEmergencyContact, submitFeedback } from "@/server/privileged/event";

const loc = (v: FormDataEntryValue | null) => (isLocale(String(v)) ? String(v) : "en");

export async function saveEmergencyContactAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  const d = z
    .object({ applicationId: z.uuid(), name: z.string().trim().min(2).max(120), relation: z.string().trim().min(2).max(60), phone: z.string().trim().min(6).max(30), medicalNotes: z.string().max(1000).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!user || !d.success) return;
  await saveEmergencyContact(user, d.data.applicationId, { name: d.data.name, relation: d.data.relation, phone: d.data.phone, medicalNotes: d.data.medicalNotes || null });
  revalidatePath(`/${loc(formData.get("locale"))}/me`);
}

export async function createSubmissionUploadAction(input: { applicationId: string; size: number; mime: string }) {
  const user = await getSessionUser();
  if (!user || input.mime !== "application/pdf" || !z.uuid().safeParse(input.applicationId).success) return null;
  return createSubmissionUpload(user, input.applicationId, input.size);
}

export async function recordSubmissionAction(input: { applicationId: string; path: string; fileName: string; title: string; abstract: string; locale: string }) {
  const user = await getSessionUser();
  const d = z
    .object({ applicationId: z.uuid(), path: z.string().max(300), fileName: z.string().max(300), title: z.string().trim().min(3).max(200), abstract: z.string().max(3000), locale: z.string() })
    .safeParse(input);
  if (!user || !d.success) return { ok: false };
  const ok = await recordSubmission(user, d.data);
  revalidatePath(`/${loc(d.data.locale)}/me`);
  return { ok };
}

export async function submitFeedbackAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  const d = z
    .object({ day: z.coerce.number().int().min(1).max(3), rating: z.coerce.number().int().min(1).max(5), liked: z.string().max(2000).default(""), improve: z.string().max(2000).default(""), locale: z.string() })
    .safeParse(Object.fromEntries(formData));
  if (!user || !d.success) return;
  const ok = await submitFeedback(user, d.data.day, d.data);
  redirect(`/${loc(d.data.locale)}/feedback/${d.data.day}?${ok ? "done=1" : "no=1"}` as never);
}
