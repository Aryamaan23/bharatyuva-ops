import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { safeEqual } from "@/server/security/crypto";

/**
 * Scopes, and why each is needed:
 * - gmail.send: send outreach as the staff member, from their own mailbox.
 * - gmail.readonly: read replies on the threads we started (reply/opt-out/bounce detection).
 *   Gmail has no narrower scope that can read a reply's text.
 * - openid email: identify which Google account was connected.
 */
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
];

export function googleConfigured(): boolean {
  const e = env();
  return Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.GMAIL_TOKEN_KEY);
}

const redirectUri = () => `${env().NEXT_PUBLIC_APP_URL}/api/gmail/callback`;

/** Signed state binds the OAuth round-trip to the staff member who started it (CSRF protection). */
export function signState(staffEmail: string, nonce: string): string {
  const payload = Buffer.from(JSON.stringify({ e: staffEmail, n: nonce, t: Date.now() })).toString("base64url");
  const sig = createHmac("sha256", env().TOKEN_SIGNING_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(state: string, nonce: string): string | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", env().TOKEN_SIGNING_SECRET).update(payload).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e: string; n: string; t: number };
  if (data.n !== nonce || Date.now() - data.t > 15 * 60_000) return null;
  return data.e;
}

export function authUrl(state: string, loginHint: string): string {
  const p = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    login_hint: loginHint,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; scope: string; id_token?: string; expires_in: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: env().GOOGLE_CLIENT_ID!, client_secret: env().GOOGLE_CLIENT_SECRET!, ...body }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) throw new GoogleAuthError(data.error ?? `HTTP ${res.status}`, data.error_description);
  return data;
}

export class GoogleAuthError extends Error {
  constructor(
    public code: string,
    description?: string,
  ) {
    super(`Google OAuth: ${code}${description ? ` (${description})` : ""}`);
  }
  /** The user revoked access or the token expired: they must reconnect. */
  get needsReconnect() {
    return this.code === "invalid_grant";
  }
}

export async function exchangeCode(code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  const claims = t.id_token ? (JSON.parse(Buffer.from(t.id_token.split(".")[1]!, "base64url").toString()) as { email?: string }) : {};
  return { refreshToken: t.refresh_token ?? null, accessToken: t.access_token, scope: t.scope, email: claims.email ?? null };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  return (await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" })).access_token;
}
