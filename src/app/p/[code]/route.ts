import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { followShortLink } from "@/server/privileged/partners";

/** Tracked short link (posters, share kits). Counts the click, then redirects. */
export async function GET(_req: Request, ctx: RouteContext<"/p/[code]">) {
  const { code } = await ctx.params;
  const target = await followShortLink(code);
  return NextResponse.redirect(target ?? new URL("/en", env().NEXT_PUBLIC_APP_URL), { status: 302 });
}
