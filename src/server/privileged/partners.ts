import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { env } from "@/lib/env";
import { adminDb } from "@/server/db/admin";
import { activities, applicants, applications, editions, organisations, partnerAccess, partnerRequests, partnerships, shortLinks, staffMembers, tasks } from "@/server/db/schema";
import { todayIst } from "@/server/domain/sequences";
import { enqueueEmail } from "@/server/messaging/outbox";
import { hashToken, newToken } from "@/server/security/crypto";
import { audit } from "./audit";
import { trackedLink } from "./outreach";

/** A private, unguessable link for a partner contact. Only the hash is stored. */
export async function createPartnerLink(partnershipId: string, contactEmail: string | null, actorEmail: string): Promise<string> {
  const token = newToken();
  await adminDb().insert(partnerAccess).values({ partnershipId, contactEmail, tokenHash: hashToken(token) });
  await audit({ actorEmail, action: "partner.link_created", entity: "partnership", entityId: partnershipId, after: { contactEmail } });
  return `${env().NEXT_PUBLIC_APP_URL}/partner/${token}`;
}

export async function revokePartnerLinks(partnershipId: string, actorEmail: string) {
  await adminDb().update(partnerAccess).set({ revokedAt: new Date() }).where(and(eq(partnerAccess.partnershipId, partnershipId), isNull(partnerAccess.revokedAt)));
  await audit({ actorEmail, action: "partner.links_revoked", entity: "partnership", entityId: partnershipId });
}

export async function resolvePartnerToken(token: string) {
  if (token.length < 20 || token.length > 100) return null;
  const db = adminDb();
  const [access] = await db
    .select()
    .from(partnerAccess)
    .where(and(eq(partnerAccess.tokenHash, hashToken(token)), isNull(partnerAccess.revokedAt)))
    .limit(1);
  if (!access) return null;
  await db.update(partnerAccess).set({ lastSeenAt: new Date() }).where(eq(partnerAccess.id, access.id));
  return access;
}

/**
 * Everything on a partner's private page. The fellow list (name + college only) is shared only
 * once the partnership is confirmed, and only for fellows who have confirmed their seats.
 */
export async function partnerPageData(partnershipId: string) {
  const db = adminDb();
  const [row] = await db
    .select({ p: partnerships, org: organisations, edition: editions })
    .from(partnerships)
    .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
    .innerJoin(editions, eq(editions.id, partnerships.editionId))
    .where(eq(partnerships.id, partnershipId))
    .limit(1);
  if (!row) return null;
  const [owner] = row.p.ownerEmail
    ? await db.select({ fullName: staffMembers.fullName, email: staffMembers.email, phone: staffMembers.phone }).from(staffMembers).where(eq(staffMembers.email, row.p.ownerEmail)).limit(1)
    : [];
  const fellows =
    row.p.stage === "confirmed"
      ? await db
          .select({ name: applicants.fullName, college: applicants.college })
          .from(applications)
          .innerJoin(applicants, eq(applicants.id, applications.applicantId))
          .where(and(eq(applications.editionId, row.edition.id), inArray(applications.status, ["confirmed", "attended"])))
          .orderBy(applicants.fullName)
      : [];
  const applyLink = await trackedLink({
    targetUrl: `${env().NEXT_PUBLIC_APP_URL}/en?utm_source=partner&utm_medium=share_kit&utm_campaign=${encodeURIComponent(row.org.name.slice(0, 40))}`,
    label: "share:apply",
    partnershipId,
    editionId: row.edition.id,
  });
  const posterTarget = row.edition.posterUrls.general ?? row.edition.posterUrls[row.org.type as "university" | "district" | "embassy"];
  const posterLink = posterTarget ? await trackedLink({ targetUrl: posterTarget, label: "share:poster", partnershipId, editionId: row.edition.id }) : null;
  const requests = await db.select().from(partnerRequests).where(eq(partnerRequests.partnershipId, partnershipId)).orderBy(partnerRequests.createdAt);
  return { ...row, owner: owner ?? null, fellows, applyLink, posterLink, requests };
}

export async function submitPartnerRequest(partnershipId: string, fromName: string, message: string) {
  const db = adminDb();
  const [p] = await db
    .select({ p: partnerships, orgName: organisations.name })
    .from(partnerships)
    .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
    .where(eq(partnerships.id, partnershipId))
    .limit(1);
  if (!p) return;
  const [req] = await db.insert(partnerRequests).values({ partnershipId, fromName: fromName.slice(0, 120), message: message.slice(0, 4000) }).returning();
  await db.insert(activities).values({ partnershipId, kind: "partner_request", body: message.slice(0, 500), actorEmail: fromName.slice(0, 120) });
  await db.insert(tasks).values({
    editionId: p.p.editionId,
    title: `Partner question from ${p.orgName}`,
    kind: "partner_request",
    ownerEmail: p.p.ownerEmail,
    dueAt: todayIst(),
    partnershipId,
    notes: message.slice(0, 2000),
    sourceKey: `partner_request:${req!.id}`,
  });
  if (p.p.ownerEmail) {
    await enqueueEmail({
      idempotencyKey: `partner-request:${req!.id}`,
      to: p.p.ownerEmail,
      template: "owner_notification",
      email: {
        subject: `${p.orgName} sent a question`,
        html: null,
        text: `${fromName || "A partner contact"} at ${p.orgName} wrote:\n\n${message}\n\nOpen: ${env().NEXT_PUBLIC_APP_URL}/admin/outreach/${partnershipId}`,
      },
      relatedEntity: "partnership",
      relatedId: partnershipId,
    });
  }
}

/** Resolve /p/<code>, counting the click. */
export async function followShortLink(code: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{4,20}$/.test(code)) return null;
  const db = adminDb();
  const [link] = await db.select().from(shortLinks).where(eq(shortLinks.code, code)).limit(1);
  if (!link) return null;
  await db
    .update(shortLinks)
    .set({ clicks: link.clicks + 1 })
    .where(eq(shortLinks.code, code));
  return link.targetUrl;
}
