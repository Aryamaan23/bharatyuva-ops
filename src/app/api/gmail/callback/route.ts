import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getStaffSession } from "@/server/auth/session";
import { exchangeCode, GMAIL_SCOPES, verifyState } from "@/server/gmail/oauth";
import { saveGmailConnection } from "@/server/privileged/gmail";

export async function GET(request: NextRequest) {
  const appUrl = env().NEXT_PUBLIC_APP_URL;
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/settings/gmail?${q}`, appUrl));
  const session = await getStaffSession();
  if (!session) return NextResponse.redirect(new URL("/login", appUrl));
  const p = request.nextUrl.searchParams;
  if (p.get("error")) return back(`error=${encodeURIComponent(p.get("error")!)}`);
  const nonce = request.cookies.get("by_gmail_nonce")?.value ?? "";
  const stateEmail = verifyState(p.get("state") ?? "", nonce);
  if (!stateEmail || stateEmail !== session.email) return back("error=state_mismatch");
  try {
    const t = await exchangeCode(p.get("code") ?? "");
    const granted = t.scope.split(" ");
    if (!t.refreshToken) return back("error=no_refresh_token");
    if (!GMAIL_SCOPES.slice(0, 2).every((s) => granted.includes(s))) return back("error=missing_scopes");
    await saveGmailConnection({ staffEmail: session.email, googleEmail: t.email ?? session.email, refreshToken: t.refreshToken, scopes: t.scope });
    const res = back("connected=1");
    res.cookies.delete({ name: "by_gmail_nonce", path: "/api/gmail" });
    return res;
  } catch {
    return back("error=exchange_failed");
  }
}
