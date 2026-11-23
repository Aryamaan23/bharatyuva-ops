import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { StaffSession } from "@/server/auth/session";
import {
  aiSummaries,
  applicants,
  applications,
  decisionBatches,
  interviewBookings,
  interviewSlots,
  reviewAssignments,
  reviews,
  rubrics,
  type ApplicationStatus,
} from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { aggregateTotals } from "@/server/domain/scoring";

export type ScoreRow = {
  id: string;
  name: string | null;
  state: string | null;
  college: string | null;
  gender: string | null;
  discipline: string | null;
  status: ApplicationStatus;
  waitlistRank: number | null;
  duplicate: boolean;
  hasSummary: boolean;
  reviewers: { email: string; total: number | null }[];
  mean: number | null;
  spread: number | null;
  disagreement: boolean;
};

/** Every non-draft application with its review totals, for the scores and decisions screen. */
export async function scoreboard(session: StaffSession, editionId: string, status?: ApplicationStatus): Promise<ScoreRow[]> {
  return withUserDb(session.claims, async (tx) => {
    const apps = await tx
      .select({
        id: applications.id,
        status: applications.status,
        waitlistRank: applications.waitlistRank,
        duplicateOf: applications.duplicateOf,
        answers: applications.answers,
        name: applicants.fullName,
        state: applicants.state,
        college: applicants.college,
        gender: applicants.gender,
      })
      .from(applications)
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .where(and(eq(applications.editionId, editionId), status ? eq(applications.status, status) : sql`${applications.status} not in ('draft','withdrawn')`));
    if (apps.length === 0) return [];
    const ids = apps.map((a) => a.id);
    const assigned = await tx
      .select({ applicationId: reviewAssignments.applicationId, email: reviewAssignments.reviewerEmail, total: reviews.total })
      .from(reviewAssignments)
      .leftJoin(reviews, eq(reviews.assignmentId, reviewAssignments.id))
      .where(inArray(reviewAssignments.applicationId, ids));
    const summaries = await tx.select({ applicationId: aiSummaries.applicationId }).from(aiSummaries).where(inArray(aiSummaries.applicationId, ids));
    const withSummary = new Set(summaries.map((s) => s.applicationId));
    return apps
      .map((a) => {
        const rs = assigned.filter((r) => r.applicationId === a.id).map((r) => ({ email: r.email, total: r.total }));
        const agg = aggregateTotals(rs.map((r) => r.total).filter((t): t is number => t !== null));
        return {
          id: a.id,
          name: a.name,
          state: a.state,
          college: a.college,
          gender: a.gender,
          discipline: typeof a.answers.discipline === "string" ? a.answers.discipline : null,
          status: a.status,
          waitlistRank: a.waitlistRank,
          duplicate: Boolean(a.duplicateOf),
          hasSummary: withSummary.has(a.id),
          reviewers: rs,
          mean: agg.mean,
          spread: agg.spread,
          disagreement: agg.disagreement,
        };
      })
      .sort((x, y) => (y.mean ?? -1) - (x.mean ?? -1));
  });
}

export function diversity(rows: ScoreRow[], statuses: ApplicationStatus[]) {
  const pick = rows.filter((r) => statuses.includes(r.status));
  const tally = (key: "state" | "college" | "gender" | "discipline") => {
    const m = new Map<string, number>();
    for (const r of pick) {
      const k = r[key] ?? (key === "gender" ? "not stated" : "unknown");
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  return { total: pick.length, state: tally("state"), college: tally("college"), gender: tally("gender"), discipline: tally("discipline") };
}

export async function reviewerWorkload(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, (tx) =>
    tx
      .select({ email: reviewAssignments.reviewerEmail, total: count(), done: sql<number>`count(*) filter (where ${reviewAssignments.status} = 'submitted')::int` })
      .from(reviewAssignments)
      .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
      .where(eq(applications.editionId, editionId))
      .groupBy(reviewAssignments.reviewerEmail)
      .orderBy(asc(reviewAssignments.reviewerEmail)),
  );
}

export async function getRubric(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, async (tx) => (await tx.select().from(rubrics).where(eq(rubrics.editionId, editionId)).limit(1))[0] ?? null);
}

export async function listSlots(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, async (tx) => {
    const slots = await tx.select().from(interviewSlots).where(eq(interviewSlots.editionId, editionId)).orderBy(asc(interviewSlots.startsAt));
    const bookings = slots.length
      ? await tx
          .select({ slotId: interviewBookings.slotId, name: applicants.fullName, applicationId: applications.id })
          .from(interviewBookings)
          .innerJoin(applications, eq(applications.id, interviewBookings.applicationId))
          .innerJoin(applicants, eq(applicants.id, applications.applicantId))
          .where(inArray(interviewBookings.slotId, slots.map((s) => s.id)))
      : [];
    return slots.map((s) => ({ ...s, bookings: bookings.filter((b) => b.slotId === s.id) }));
  });
}

export async function getBatch(session: StaffSession, id: string) {
  return withUserDb(session.claims, async (tx) => (await tx.select().from(decisionBatches).where(eq(decisionBatches.id, id)).limit(1))[0] ?? null);
}

export async function recentBatches(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, (tx) =>
    tx.select().from(decisionBatches).where(and(eq(decisionBatches.editionId, editionId), isNotNull(decisionBatches.sentAt))).orderBy(desc(decisionBatches.sentAt)).limit(10),
  );
}

export async function batchApplicants(session: StaffSession, ids: string[]) {
  return withUserDb(session.claims, (tx) =>
    tx
      .select({ id: applications.id, locale: applications.locale, status: applications.status, name: applicants.fullName, email: applicants.email })
      .from(applications)
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .where(inArray(applications.id, ids)),
  );
}
