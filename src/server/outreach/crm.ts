import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { StaffSession } from "@/server/auth/session";
import {
  activities,
  contacts,
  emailTemplates,
  gmailConnections,
  gmailThreads,
  organisations,
  partnerAccess,
  partnerRequests,
  partnerships,
  partnerStage,
  sequenceSteps,
  staffMembers,
  tasks,
  type PartnerStage,
  type PartnerType,
  type Temperature,
} from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { todayIst } from "@/server/domain/sequences";

export const STAGES = partnerStage.enumValues;

export type PipelineFilters = {
  editionId: string;
  type?: PartnerType;
  temperature?: Temperature;
  stage?: PartnerStage;
  owner?: string;
  q?: string;
  flagged?: boolean;
};

export async function listPipeline(session: StaffSession, f: PipelineFilters) {
  const conds: (SQL | undefined)[] = [eq(partnerships.editionId, f.editionId)];
  if (f.type) conds.push(eq(organisations.type, f.type));
  if (f.temperature) conds.push(eq(partnerships.temperature, f.temperature));
  if (f.stage) conds.push(eq(partnerships.stage, f.stage));
  if (f.owner === "none") conds.push(isNull(partnerships.ownerEmail));
  else if (f.owner) conds.push(eq(partnerships.ownerEmail, f.owner));
  if (f.flagged) conds.push(eq(organisations.needsVerification, true));
  if (f.q) {
    const term = `%${f.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(organisations.name, term), ilike(organisations.location, term)));
  }
  return withUserDb(session.claims, async (tx) => {
    const rows = await tx
      .select({
        id: partnerships.id,
        stage: partnerships.stage,
        temperature: partnerships.temperature,
        ownerEmail: partnerships.ownerEmail,
        nextActionAt: partnerships.nextActionAt,
        pastPartner: partnerships.pastPartner,
        updatedAt: partnerships.updatedAt,
        orgId: organisations.id,
        name: organisations.name,
        type: organisations.type,
        location: organisations.location,
        needsVerification: organisations.needsVerification,
        doNotContact: organisations.doNotContact,
        hasEmail: sql<boolean>`exists (select 1 from app.contacts c where c.organisation_id = ${organisations.id} and c.email is not null and c.bounced_at is null)`,
        nextStep: sql<string | null>`(select s.step || ' ' || s.due_at from app.sequence_steps s where s.partnership_id = ${partnerships.id} and s.status in ('pending','queued') order by s.due_at limit 1)`,
      })
      .from(partnerships)
      .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
      .where(and(...conds))
      .orderBy(sql`case ${partnerships.temperature} when 'hot' then 0 when 'warm' then 1 else 2 end`, asc(organisations.name));
    const stageCounts = await tx
      .select({ stage: partnerships.stage, type: organisations.type, n: count() })
      .from(partnerships)
      .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
      .where(eq(partnerships.editionId, f.editionId))
      .groupBy(partnerships.stage, organisations.type);
    return { rows, stageCounts };
  });
}

export async function getPartnership(session: StaffSession, id: string) {
  return withUserDb(session.claims, async (tx) => {
    const [row] = await tx
      .select({ p: partnerships, org: organisations })
      .from(partnerships)
      .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
      .where(eq(partnerships.id, id))
      .limit(1);
    if (!row) return null;
    const [orgContacts, steps, timeline, openTasks, thread, links, requests] = await Promise.all([
      tx.select().from(contacts).where(eq(contacts.organisationId, row.org.id)).orderBy(desc(contacts.isPrimary)),
      tx.select().from(sequenceSteps).where(eq(sequenceSteps.partnershipId, id)).orderBy(asc(sequenceSteps.dueAt)),
      tx.select().from(activities).where(eq(activities.partnershipId, id)).orderBy(desc(activities.at)).limit(100),
      tx.select().from(tasks).where(and(eq(tasks.partnershipId, id), eq(tasks.status, "open"))),
      tx.select().from(gmailThreads).where(eq(gmailThreads.partnershipId, id)).limit(1),
      tx.select({ id: partnerAccess.id, contactEmail: partnerAccess.contactEmail, lastSeenAt: partnerAccess.lastSeenAt, revokedAt: partnerAccess.revokedAt, createdAt: partnerAccess.createdAt }).from(partnerAccess).where(eq(partnerAccess.partnershipId, id)),
      tx.select().from(partnerRequests).where(eq(partnerRequests.partnershipId, id)).orderBy(desc(partnerRequests.createdAt)),
    ]);
    return { ...row, contacts: orgContacts, steps, timeline, tasks: openTasks, thread: thread[0] ?? null, links, requests };
  });
}

/** Email steps due today or earlier for partners this person owns. */
export async function listQueue(session: StaffSession, ownerEmail: string) {
  return withUserDb(session.claims, (tx) =>
    tx
      .select({ stepId: sequenceSteps.id, step: sequenceSteps.step, dueAt: sequenceSteps.dueAt, partnershipId: partnerships.id, orgName: organisations.name, type: organisations.type })
      .from(sequenceSteps)
      .innerJoin(partnerships, eq(partnerships.id, sequenceSteps.partnershipId))
      .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
      .where(
        and(
          eq(sequenceSteps.status, "pending"),
          inArray(sequenceSteps.step, ["first", "fu1", "fu2"]),
          lte(sequenceSteps.dueAt, todayIst()),
          eq(partnerships.ownerEmail, ownerEmail),
          eq(organisations.doNotContact, false),
          inArray(partnerships.stage, ["not_contacted", "email_sent", "follow_up_1", "follow_up_2"]),
        ),
      )
      .orderBy(asc(sequenceSteps.dueAt), sql`case ${partnerships.temperature} when 'hot' then 0 when 'warm' then 1 else 2 end`),
  );
}

export async function listStaffOptions(session: StaffSession) {
  return withUserDb(session.claims, (tx) =>
    tx
      .select({ email: staffMembers.email, fullName: staffMembers.fullName })
      .from(staffMembers)
      .where(and(eq(staffMembers.active, true), sql`${staffMembers.roles} && array['owner','admin','staff']::app.staff_role[]`))
      .orderBy(asc(staffMembers.fullName)),
  );
}

export async function listTemplates(session: StaffSession) {
  return withUserDb(session.claims, (tx) => tx.select().from(emailTemplates).orderBy(asc(emailTemplates.partnerType), asc(emailTemplates.step)));
}

export async function gmailStatusFor(session: StaffSession) {
  return withUserDb(session.claims, async (tx) => {
    const [row] = await tx
      .select({ googleEmail: gmailConnections.googleEmail, status: gmailConnections.status, dailyCap: gmailConnections.dailyCap, lastError: gmailConnections.lastError, updatedAt: gmailConnections.updatedAt })
      .from(gmailConnections)
      .where(eq(gmailConnections.staffEmail, session.email))
      .limit(1);
    return row ?? null;
  });
}

export async function listGmailConnections(session: StaffSession) {
  return withUserDb(session.claims, (tx) =>
    tx.select({ staffEmail: gmailConnections.staffEmail, googleEmail: gmailConnections.googleEmail, status: gmailConnections.status, dailyCap: gmailConnections.dailyCap, lastError: gmailConnections.lastError }).from(gmailConnections),
  );
}
