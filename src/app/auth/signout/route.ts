import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeNextPath } from "@/server/auth/redirect";
import { supabaseServer } from "@/server/auth/supabase";

// POST only, so a cross-site link or image can't sign people out. Origin is checked as CSRF defence.
export async function POST(request: NextRequest) {
  const appUrl = env().NEXT_PUBLIC_APP_URL;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(appUrl).origin) return new NextResponse("Forbidden", { status: 403 });
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  const form = await request.formData().catch(() => null);
  const next = safeNextPath(form?.get("next")?.toString(), appUrl, "/");
  return NextResponse.redirect(new URL(next, appUrl), { status: 303 });
}
