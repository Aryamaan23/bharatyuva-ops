import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/** Ambassador referral link: lands on the site with the code and UTM tags (the proxy stores them). */
export async function GET(_req: Request, ctx: RouteContext<"/r/[code]">) {
  const { code } = await ctx.params;
  const url = new URL("/en", env().NEXT_PUBLIC_APP_URL);
  if (/^[A-Za-z0-9-]{3,32}$/.test(code)) {
    url.searchParams.set("ref", code.toUpperCase());
    url.searchParams.set("utm_source", "ambassador");
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", code.toUpperCase());
  }
  return NextResponse.redirect(url, { status: 302 });
}
