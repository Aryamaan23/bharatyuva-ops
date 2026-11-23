import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeNextPath } from "@/server/auth/redirect";
import { supabaseServer } from "@/server/auth/supabase";
import { ensureOwnerBootstrap } from "@/server/privileged/staff";

/** Magic-link landing: verifies the one-time token_hash and sets the session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  const appUrl = env().NEXT_PUBLIC_APP_URL;
  const next = safeNextPath(searchParams.get("next"), appUrl, "/en/me");

  if (tokenHash) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.user?.email) {
      await ensureOwnerBootstrap(data.user.email, null);
      return NextResponse.redirect(new URL(next, appUrl));
    }
  }
  const failed = new URL(next.startsWith("/admin") ? "/login" : next, appUrl);
  failed.searchParams.set("auth_error", "link_invalid");
  return NextResponse.redirect(failed);
}
