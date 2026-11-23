import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getStaffSession } from "@/server/auth/session";
import { authUrl, googleConfigured, signState } from "@/server/gmail/oauth";

/** Start Google OAuth for the signed-in staff member's own Gmail. */
export async function GET() {
  const session = await getStaffSession();
  const appUrl = env().NEXT_PUBLIC_APP_URL;
  if (!session) return NextResponse.redirect(new URL("/login", appUrl));
  if (!googleConfigured()) return NextResponse.redirect(new URL("/admin/settings/gmail?error=not_configured", appUrl));
  const nonce = randomBytes(16).toString("base64url");
  const res = NextResponse.redirect(authUrl(signState(session.email, nonce), session.email));
  res.cookies.set("by_gmail_nonce", nonce, { httpOnly: true, secure: appUrl.startsWith("https"), sameSite: "lax", maxAge: 900, path: "/api/gmail" });
  return res;
}
