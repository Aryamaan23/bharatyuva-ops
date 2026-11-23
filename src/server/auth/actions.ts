"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { rateLimit } from "@/server/privileged/rate-limit";
import { ensureOwnerBootstrap } from "@/server/privileged/staff";
import { hashValue } from "@/server/security/crypto";
import { clientIp } from "@/server/security/request";
import { verifyTurnstile } from "@/server/security/turnstile";
import { safeNextPath } from "./redirect";
import { supabaseServer } from "./supabase";

export type MagicLinkState =
  | { status: "idle" }
  | { status: "sent"; email: string; next: string }
  | { status: "error"; error: "invalid_email" | "captcha" | "rateLimited" | "generic" | "code_invalid"; email?: string; next?: string };

const requestSchema = z.object({
  email: z.email().max(254).transform((e) => e.trim().toLowerCase()),
  next: z.string().max(300).optional(),
  captcha: z.string().optional(),
});

/** Send a Supabase magic link (with 6-digit code) to the email address. */
export async function requestMagicLink(_prev: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const parsed = requestSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
    captcha: formData.get("cf-turnstile-response") ?? undefined,
  });
  if (!parsed.success) return { status: "error", error: "invalid_email" };
  const { email } = parsed.data;
  const e = env();
  const next = safeNextPath(parsed.data.next, e.NEXT_PUBLIC_APP_URL, "/en/apply");
  const ip = await clientIp();

  if (!(await verifyTurnstile(parsed.data.captcha, ip))) {
    return { status: "error", error: "captcha", email, next };
  }
  const allowed =
    (await rateLimit("magicLinkPerEmail", hashValue(email))) && (await rateLimit("magicLinkPerIp", hashValue(ip)));
  if (!allowed) return { status: "error", error: "rateLimited", email, next };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: new URL(next, e.NEXT_PUBLIC_APP_URL).toString(), shouldCreateUser: true },
  });
  if (error) {
    console.error("signInWithOtp failed", error.message);
    return { status: "error", error: error.status === 429 ? "rateLimited" : "generic", email, next };
  }
  return { status: "sent", email, next };
}

const codeSchema = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  code: z.string().regex(/^\d{6}$/),
  next: z.string().max(300).optional(),
});

/** Fallback for people who open the email on a different device: type the 6-digit code. */
export async function verifyEmailCode(_prev: MagicLinkState, formData: FormData): Promise<MagicLinkState> {
  const parsed = codeSchema.safeParse({
    email: formData.get("email"),
    code: String(formData.get("code") ?? "").replace(/\s/g, ""),
    next: formData.get("next") ?? undefined,
  });
  const e = env();
  if (!parsed.success) {
    const email = String(formData.get("email") ?? "");
    return { status: "error", error: "code_invalid", email, next: String(formData.get("next") ?? "") };
  }
  const next = safeNextPath(parsed.data.next, e.NEXT_PUBLIC_APP_URL, "/en/apply");
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: "email" });
  if (error || !data.user?.email) return { status: "error", error: "code_invalid", email: parsed.data.email, next };
  await ensureOwnerBootstrap(data.user.email, null);
  redirect(next as never);
}

/** Staff sign-in with Google (Supabase OAuth). */
export async function signInWithGoogle(): Promise<void> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${env().NEXT_PUBLIC_APP_URL}/auth/callback?next=/admin` },
  });
  if (error || !data.url) redirect("/login?auth_error=oauth_unavailable");
  redirect(data.url as never);
}
