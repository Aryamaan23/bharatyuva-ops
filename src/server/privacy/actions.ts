"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { createDataRequest } from "@/server/privileged/data-requests";
import { rateLimit } from "@/server/privileged/rate-limit";
import { clientIp, clientIpHash } from "@/server/security/request";
import { verifyTurnstile } from "@/server/security/turnstile";

export type DataRequestState = { status: "idle" | "error"; error?: "invalid" | "captcha" | "rateLimited" };

const schema = z.object({
  email: z.email().max(254),
  kind: z.enum(["delete", "access"]),
  reason: z.string().max(1000).optional(),
  locale: z.string(),
});

export async function submitDataRequest(_prev: DataRequestState, formData: FormData): Promise<DataRequestState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    kind: formData.get("kind"),
    reason: formData.get("reason") || undefined,
    locale: formData.get("locale"),
  });
  if (!parsed.success) return { status: "error", error: "invalid" };
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response")?.toString(), await clientIp()))) {
    return { status: "error", error: "captcha" };
  }
  if (!(await rateLimit("dataRequestPerIp", await clientIpHash()))) return { status: "error", error: "rateLimited" };
  const locale = isLocale(parsed.data.locale) ? parsed.data.locale : "en";
  await createDataRequest({ email: parsed.data.email, kind: parsed.data.kind, reason: parsed.data.reason ?? null, locale });
  redirect(`/${locale}/data-request?sent=1` as never);
}
