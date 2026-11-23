import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { env } from "@/lib/env";
import type { SessionUser } from "@/server/auth/session";
import { adminDb } from "@/server/db/admin";
import { ambassadors, applications, editions, partnerships, staffMembers } from "@/server/db/schema";
import { makeAmbassadorCode } from "@/server/domain/ambassador";
import { formatDate } from "@/server/domain/editions";
import { enqueueEmail } from "@/server/messaging/outbox";
import * as templates from "@/server/messaging/templates";
import { audit } from "./audit";

export const referralLink = (code: string) => `${env().NEXT_PUBLIC_APP_URL}/r/${code}`;

export async function applyAsAmbassador(user: SessionUser, editionId: string, input: { fullName: string; college: string; phone: string | null; motivation: string | null }) {
  await adminDb()
    .insert(ambassadors)
    .values({ editionId, userId: user.id, email: user.email, ...input })
    .onConflictDoUpdate({ target: [ambassadors.editionId, ambassadors.email], set: { ...input, userId: user.id } });
  await audit({ actorEmail: user.email, action: "ambassador.applied", entity: "edition", entityId: editionId });
}

export async function myAmbassador(user: SessionUser, editionId: string) {
  const [row] = await adminDb()
    .select()
    .from(ambassadors)
    .where(and(eq(ambassadors.editionId, editionId), eq(ambassadors.email, user.email)))
    .limit(1);
  return row ?? null;
}

export async function reviewAmbassador(id: string, approve: boolean, actorEmail: string) {
  const db = adminDb();
  const [a] = await db.select().from(ambassadors).where(eq(ambassadors.id, id)).limit(1);
  if (!a) return;
  let code = a.code;
  if (approve && !code) {
    for (let i = 0; i < 5 && !code; i++) {
      const candidate = makeAmbassadorCode(a.fullName);
      const [clash] = await db.select({ id: ambassadors.id }).from(ambassadors).where(eq(ambassadors.code, candidate)).limit(1);
      if (!clash) code = candidate;
    }
  }
  await db.update(ambassadors).set({ status: approve ? "approved" : "rejected", code, reviewedBy: actorEmail }).where(eq(ambassadors.id, id));
  await audit({ actorEmail, action: approve ? "ambassador.approved" : "ambassador.rejected", entity: "ambassador", entityId: id });
  if (approve && code) {
    const [edition] = await db.select({ name: editions.name }).from(editions).where(eq(editions.id, a.editionId)).limit(1);
    await enqueueEmail({
      idempotencyKey: `ambassador-approved:${id}`,
      to: a.email,
      template: "ambassador_approved",
      email: templates.ambassadorApproved({ name: a.fullName, editionName: edition?.name ?? "Bharat Yuva", link: referralLink(code), portalUrl: `${env().NEXT_PUBLIC_APP_URL}/en/ambassador` }),
      relatedEntity: "ambassador",
      relatedId: id,
    });
  }
}

export type LeaderboardRow = { id: string; fullName: string; college: string; email: string; code: string | null; status: string; submitted: number; started: number };

/** Referrals per ambassador: submitted applications and drafts carrying their code. */
export async function leaderboard(editionId: string): Promise<LeaderboardRow[]> {
  const db = adminDb();
  return db
    .select({
      id: ambassadors.id,
      fullName: ambassadors.fullName,
      college: ambassadors.college,
      email: ambassadors.email,
      code: ambassadors.code,
      status: ambassadors.status,
      submitted: sql<number>`(select count(*)::int from app.applications ap where ap.edition_id = ${ambassadors.editionId} and upper(ap.referral_code) = ${ambassadors.code} and ap.status <> 'draft')`,
      started: sql<number>`(select count(*)::int from app.applications ap where ap.edition_id = ${ambassadors.editionId} and upper(ap.referral_code) = ${ambassadors.code})`,
    })
    .from(ambassadors)
    .where(eq(ambassadors.editionId, editionId))
    .orderBy(desc(sql`3`), asc(ambassadors.fullName))
    .then((rows) => rows.sort((a, b) => b.submitted - a.submitted || b.started - a.started || a.fullName.localeCompare(b.fullName)));
}

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#273661", light: "#ffffff" }, errorCorrectionLevel: "M" });
}

/** Monday: progress email to each approved ambassador, and a summary to owners. */
export async function sendWeeklyEmails(now = new Date()) {
  const db = adminDb();
  const [edition] = await db.select().from(editions).where(eq(editions.isCurrent, true)).limit(1);
  if (!edition) return { ambassadors: 0, owners: 0 };
  const week = now.toISOString().slice(0, 10);
  const board = (await leaderboard(edition.id)).filter((r) => r.status === "approved");
  let ambassadorEmails = 0;
  for (const [i, a] of board.entries()) {
    const id = await enqueueEmail({
      idempotencyKey: `ambassador-weekly:${week}:${a.id}`,
      to: a.email,
      template: "ambassador_weekly",
      email: templates.ambassadorWeekly({
        name: a.fullName.split(" ")[0] ?? a.fullName,
        editionName: edition.name,
        started: a.started,
        submitted: a.submitted,
        rank: a.submitted > 0 ? i + 1 : null,
        total: board.length,
        deadline: edition.applicationsCloseAt ? formatDate(edition.applicationsCloseAt) : null,
        portalUrl: `${env().NEXT_PUBLIC_APP_URL}/en/ambassador`,
      }),
      relatedEntity: "ambassador",
      relatedId: a.id,
    });
    if (id) ambassadorEmails += 1;
  }

  const since = new Date(now.getTime() - 7 * 86_400_000);
  const [submittedWeek] = await db
    .select({ n: count() })
    .from(applications)
    .where(and(eq(applications.editionId, edition.id), sql`${applications.submittedAt} >= ${since}`));
  const byStatus = await db.select({ status: applications.status, n: count() }).from(applications).where(eq(applications.editionId, edition.id)).groupBy(applications.status);
  const partnerStages = await db.select({ stage: partnerships.stage, n: count() }).from(partnerships).where(eq(partnerships.editionId, edition.id)).groupBy(partnerships.stage);
  const owners = await db.select({ email: staffMembers.email }).from(staffMembers).where(and(eq(staffMembers.active, true), sql`'owner' = any(${staffMembers.roles})`));
  const text = [
    `${edition.name}: week ending ${week}`,
    "",
    `New submitted applications this week: ${submittedWeek?.n ?? 0}`,
    `Applications by status: ${byStatus.map((r) => `${r.status} ${r.n}`).join(", ") || "none"}`,
    `Partners by stage: ${partnerStages.map((r) => `${r.stage.replace(/_/g, " ")} ${r.n}`).join(", ") || "none"}`,
    `Top ambassadors: ${board.slice(0, 5).map((a) => `${a.fullName} (${a.submitted})`).join(", ") || "none yet"}`,
    "",
    `Dashboard: ${env().NEXT_PUBLIC_APP_URL}/admin`,
  ].join("\n");
  let ownerEmails = 0;
  for (const o of owners) {
    const id = await enqueueEmail({ idempotencyKey: `weekly-summary:${week}:${o.email}`, to: o.email, template: "weekly_summary", email: { subject: `${edition.name}: weekly summary`, html: null, text }, relatedEntity: "edition", relatedId: edition.id });
    if (id) ownerEmails += 1;
  }
  return { ambassadors: ambassadorEmails, owners: ownerEmails };
}
