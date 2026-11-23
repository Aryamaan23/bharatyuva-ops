import "server-only";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { adminDb } from "@/server/db/admin";
import { gmailConnections } from "@/server/db/schema";
import { GoogleGmailClient, LocalGmailClient, type GmailClient } from "@/server/gmail/client";
import { decryptSecret, encryptSecret } from "@/server/gmail/crypto";
import { googleConfigured } from "@/server/gmail/oauth";
import { audit } from "./audit";

export async function saveGmailConnection(input: { staffEmail: string; googleEmail: string; refreshToken: string; scopes: string }) {
  const values = {
    staffEmail: input.staffEmail,
    googleEmail: input.googleEmail.toLowerCase(),
    refreshTokenEnc: encryptSecret(input.refreshToken),
    scopes: input.scopes,
    status: "active" as const,
    lastError: null,
  };
  await adminDb()
    .insert(gmailConnections)
    .values(values)
    .onConflictDoUpdate({ target: gmailConnections.staffEmail, set: values });
  await audit({ actorEmail: input.staffEmail, action: "gmail.connected", entity: "gmail_connection", entityId: input.staffEmail, after: { googleEmail: values.googleEmail } });
}

export async function getGmailConnection(staffEmail: string) {
  const [row] = await adminDb().select().from(gmailConnections).where(eq(gmailConnections.staffEmail, staffEmail)).limit(1);
  return row ?? null;
}

export async function markGmailError(staffEmail: string, error: string, revoked: boolean) {
  await adminDb()
    .update(gmailConnections)
    .set({ status: revoked ? "revoked" : "error", lastError: error.slice(0, 500) })
    .where(eq(gmailConnections.staffEmail, staffEmail));
}

export async function setGmailDailyCap(staffEmail: string, cap: number, actorEmail: string) {
  await adminDb().update(gmailConnections).set({ dailyCap: cap }).where(eq(gmailConnections.staffEmail, staffEmail));
  await audit({ actorEmail, action: "gmail.cap_changed", entity: "gmail_connection", entityId: staffEmail, after: { cap } });
}

export type Sender = { client: GmailClient; fromAddress: string; dailyCap: number };

/**
 * The mailbox a staff member sends from. With Google configured that is their connected Gmail;
 * in development without Google credentials, a local stand-in that delivers to Mailpit.
 */
export async function senderFor(staffEmail: string): Promise<Sender | { error: string }> {
  if (googleConfigured()) {
    const conn = await getGmailConnection(staffEmail);
    if (!conn) return { error: "Gmail not connected" };
    if (conn.status !== "active") return { error: "Gmail needs reconnecting" };
    return { client: new GoogleGmailClient(decryptSecret(conn.refreshTokenEnc)), fromAddress: conn.googleEmail, dailyCap: conn.dailyCap };
  }
  if (env().VERCEL_ENV === "production") return { error: "Google OAuth is not configured" };
  const conn = await getGmailConnection(staffEmail);
  return { client: new LocalGmailClient(), fromAddress: staffEmail, dailyCap: conn?.dailyCap ?? 30 };
}
