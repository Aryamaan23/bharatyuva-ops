import "server-only";
import { and, asc, avg, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { StaffSession } from "@/server/auth/session";
import {
  applicants,
  applications,
  certificates,
  checkins,
  emergencyContacts,
  feedbackResponses,
  organisations,
  partnerships,
  runOfShow,
  submissions,
  teamMembers,
  teams,
} from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";

export async function fellowsWithTeams(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, async (tx) => {
    const fellows = await tx
      .select({ id: applications.id, status: applications.status, name: applicants.fullName, college: applicants.college, state: applicants.state, gender: applicants.gender, answers: applications.answers })
      .from(applications)
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .where(and(eq(applications.editionId, editionId), inArray(applications.status, ["confirmed", "attended"])))
      .orderBy(asc(applicants.fullName));
    const teamRows = await tx.select().from(teams).where(eq(teams.editionId, editionId)).orderBy(asc(teams.number));
    const members = teamRows.length ? await tx.select().from(teamMembers).where(inArray(teamMembers.teamId, teamRows.map((t) => t.id))) : [];
    return {
      fellows: fellows.map((f) => ({ ...f, discipline: typeof f.answers.discipline === "string" ? f.answers.discipline : null, teamId: members.find((m) => m.applicationId === f.id)?.teamId ?? null })),
      teams: teamRows,
    };
  });
}

export async function listRunOfShow(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, (tx) => tx.select().from(runOfShow).where(eq(runOfShow.editionId, editionId)).orderBy(asc(runOfShow.day), asc(runOfShow.startsAt)));
}

export async function attendance(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, async (tx) => {
    const fellows = await tx
      .select({ id: applications.id, name: applicants.fullName, college: applicants.college, phone: applicants.phoneE164 })
      .from(applications)
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .where(and(eq(applications.editionId, editionId), inArray(applications.status, ["confirmed", "attended"])))
      .orderBy(asc(applicants.fullName));
    const ids = fellows.map((f) => f.id);
    const ins = ids.length ? await tx.select().from(checkins).where(inArray(checkins.applicationId, ids)) : [];
    const ecs = ids.length ? await tx.select().from(emergencyContacts).where(inArray(emergencyContacts.applicationId, ids)) : [];
    return fellows.map((f) => ({
      ...f,
      days: ins.filter((c) => c.applicationId === f.id).map((c) => c.day),
      emergency: ecs.find((e) => e.applicationId === f.id) ?? null,
    }));
  });
}

export async function feedbackResults(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, async (tx) => {
    const byDay = await tx
      .select({ day: feedbackResponses.day, n: count(), avg: avg(feedbackResponses.rating) })
      .from(feedbackResponses)
      .innerJoin(applications, eq(applications.id, feedbackResponses.applicationId))
      .where(eq(applications.editionId, editionId))
      .groupBy(feedbackResponses.day)
      .orderBy(asc(feedbackResponses.day));
    const comments = await tx
      .select({ day: feedbackResponses.day, rating: feedbackResponses.rating, answers: feedbackResponses.answers })
      .from(feedbackResponses)
      .innerJoin(applications, eq(applications.id, feedbackResponses.applicationId))
      .where(eq(applications.editionId, editionId))
      .orderBy(desc(feedbackResponses.createdAt))
      .limit(200);
    return { byDay: byDay.map((d) => ({ day: d.day, n: d.n, avg: d.avg ? Math.round(Number(d.avg) * 10) / 10 : null })), comments };
  });
}

export async function listCertificates(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, (tx) => tx.select().from(certificates).where(eq(certificates.editionId, editionId)).orderBy(asc(certificates.kind), asc(certificates.recipientName)));
}

export async function listSubmissions(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, (tx) =>
    tx
      .select({ s: submissions, team: teams.name, number: teams.number })
      .from(submissions)
      .innerJoin(teams, eq(teams.id, submissions.teamId))
      .where(eq(teams.editionId, editionId))
      .orderBy(asc(teams.number), desc(submissions.createdAt)),
  );
}

/** Numbers for the impact report: funnel, sources, states, attendance, feedback, partners. */
export async function impactReport(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, async (tx) => {
    const byStatus = await tx.select({ status: applications.status, n: count() }).from(applications).where(eq(applications.editionId, editionId)).groupBy(applications.status);
    const submittedWhere = and(eq(applications.editionId, editionId), isNotNull(applications.submittedAt));
    const bySource = await tx
      .select({ label: sql<string>`coalesce(${applications.attribution} ->> 'source', case when ${applications.referralCode} is not null then 'ambassador' else 'direct' end)`, n: count() })
      .from(applications)
      .where(submittedWhere)
      .groupBy(sql`1`)
      .orderBy(desc(count()));
    const byState = await tx
      .select({ label: sql<string>`coalesce(${applicants.state}, 'Unknown')`, n: count() })
      .from(applications)
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .where(submittedWhere)
      .groupBy(sql`1`)
      .orderBy(desc(count()));
    const attendanceByDay = await tx
      .select({ day: checkins.day, n: count() })
      .from(checkins)
      .innerJoin(applications, eq(applications.id, checkins.applicationId))
      .where(eq(applications.editionId, editionId))
      .groupBy(checkins.day)
      .orderBy(asc(checkins.day));
    const feedback = await tx
      .select({ day: feedbackResponses.day, n: count(), avg: avg(feedbackResponses.rating) })
      .from(feedbackResponses)
      .innerJoin(applications, eq(applications.id, feedbackResponses.applicationId))
      .where(eq(applications.editionId, editionId))
      .groupBy(feedbackResponses.day)
      .orderBy(asc(feedbackResponses.day));
    const partners = await tx
      .select({ name: organisations.name, type: organisations.type })
      .from(partnerships)
      .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
      .where(and(eq(partnerships.editionId, editionId), eq(partnerships.stage, "confirmed")));
    const n = (s: string) => byStatus.find((r) => r.status === s)?.n ?? 0;
    const submitted = byStatus.filter((r) => r.status !== "draft").reduce((a, r) => a + r.n, 0);
    return {
      totals: {
        started: byStatus.reduce((a, r) => a + r.n, 0),
        submitted,
        states: byState.filter((s) => s.label !== "Unknown").length,
        selected: n("selected") + n("confirmed") + n("attended") + n("declined"),
        confirmed: n("confirmed") + n("attended"),
        attended: n("attended"),
      },
      bySource,
      byState,
      attendanceByDay,
      feedback: feedback.map((f) => ({ day: f.day, n: f.n, avg: f.avg ? Math.round(Number(f.avg) * 10) / 10 : null })),
      partners,
    };
  });
}

export type ImpactReport = Awaited<ReturnType<typeof impactReport>>;
