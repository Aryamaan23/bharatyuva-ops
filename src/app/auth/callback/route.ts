import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeNextPath } from "@/server/auth/redirect";
import { supabaseServer } from "@/server/auth/supabase";
import { ensureOwnerBootstrap } from "@/server/privileged/staff";

/** OAuth (Google) landing for staff: exchanges the PKCE code for a session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const appUrl = env().NEXT_PUBLIC_APP_URL;
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), appUrl, "/admin");
  if (code) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user?.email) {
      const name = typeof data.user.user_metadata?.full_name === "string" ? data.user.user_metadata.full_name : null;
      await ensureOwnerBootstrap(data.user.email, name);
      return NextResponse.redirect(new URL(next, appUrl));
    }
  }
  return NextResponse.redirect(new URL("/login?auth_error=oauth_failed", appUrl));
}
