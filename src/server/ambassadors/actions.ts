"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { getSessionUser, requireStaff } from "@/server/auth/session";
import { kickDelivery } from "@/server/messaging/send";
import { applyAsAmbassador, reviewAmbassador } from "@/server/privileged/ambassadors";
import { getCurrentEdition } from "@/server/privileged/editions";

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  college: z.string().trim().min(2).max(200),
  phone: z.string().trim().max(30).optional(),
  motivation: z.string().trim().max(1000).optional(),
  locale: z.string(),
});

export async function ambassadorSignupAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  const d = schema.safeParse(Object.fromEntries(formData));
  const locale = isLocale(String(formData.get("locale"))) ? String(formData.get("locale")) : "en";
  if (!user || !d.success) redirect(`/${locale}/ambassadors/join?error=1` as never);
  const edition = await getCurrentEdition();
  if (!edition) redirect(`/${locale}/ambassadors/join?error=1` as never);
  await applyAsAmbassador(user, edition.id, { fullName: d.data.fullName, college: d.data.college, phone: d.data.phone || null, motivation: d.data.motivation || null });
  redirect(`/${locale}/ambassador` as never);
}

export async function reviewAmbassadorAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const d = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject"]) }).parse(Object.fromEntries(formData));
  await reviewAmbassador(d.id, d.decision === "approve", session.email);
  kickDelivery();
  revalidatePath("/admin/ambassadors");
}
