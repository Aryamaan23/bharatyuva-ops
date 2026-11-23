import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE,
  REFERRAL_COOKIE,
  attributionFromUrl,
  referralFromUrl,
} from "@/lib/attribution";

/**
 * Runs before every page request:
 *  1. Refreshes the Supabase auth cookie (Server Components can't write cookies).
 *  2. Sends "/" to /en or /hi based on Accept-Language.
 *  3. Records first-touch UTM parameters and an ambassador ?ref= code in cookies.
 * Authorisation is NOT done here; every page and action checks the session itself.
 */
export async function proxy(request: NextRequest) {
  const url = request.nextUrl;

  if (url.pathname === "/") {
    const prefersHindi = /(^|,)\s*hi\b/i.test(request.headers.get("accept-language") ?? "");
    const target = url.clone();
    target.pathname = prefersHindi && process.env.VERCEL_ENV !== "production" ? "/hi" : "/en";
    return withAttribution(request, NextResponse.redirect(target));
  }

  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    });
    // Touching the session refreshes an expired access token using the refresh token.
    await supabase.auth.getClaims();
  }

  return withAttribution(request, response);
}

function withAttribution(request: NextRequest, response: NextResponse): NextResponse {
  const cookieOpts = { maxAge: ATTRIBUTION_MAX_AGE, httpOnly: true, sameSite: "lax" as const, path: "/" };
  if (!request.cookies.has(ATTRIBUTION_COOKIE)) {
    const attr = attributionFromUrl(request.nextUrl, new Date());
    if (attr) response.cookies.set(ATTRIBUTION_COOKIE, JSON.stringify(attr), cookieOpts);
  }
  const ref = referralFromUrl(request.nextUrl);
  if (ref && !request.cookies.has(REFERRAL_COOKIE)) response.cookies.set(REFERRAL_COOKIE, ref, cookieOpts);
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|webp|ico|pdf)$).*)"],
};
