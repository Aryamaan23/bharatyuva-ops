import "server-only";
import { and, count, desc, eq, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import type { StaffSession } from "@/server/auth/session";
import {
  applicants,
  applications,
  applicationStatus,
  consentRecords,
  consentVersions,
  documents,
  guardianConsents,
  type ApplicationStatus,
} from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";

export const APPLICATION_STATUSES = applicationStatus.enumValues;

export type ApplicationFilters = {
  editionId: string;
  status?: ApplicationStatus;
  state?: string;
  source?: string;
  q?: string;
  duplicatesOnly?: boolean;
  page?: number;
};

const PAGE_SIZE = 50;

function where(f: ApplicationFilters): SQL | undefined {
  const conds: (SQL | undefined)[] = [eq(applications.editionId, f.editionId)];
  if (f.status) conds.push(eq(applications.status, f.status));
  if (f.state) conds.push(eq(applicants.state, f.state));
  if (f.source) conds.push(sql`${applications.attribution} ->> 'source' = ${f.source}`);
  if (f.duplicatesOnly) conds.push(isNotNull(applications.duplicateOf));
  if (f.q) {
    const term = `%${f.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(applicants.fullName, term), ilike(applicants.email, term), ilike(applicants.college, term)));
  }
  return and(...conds);
}

export async function listApplications(session: StaffSession, f: ApplicationFilters) {
  const page = Math.max(1, f.page ?? 1);
  return withUserDb(session.claims, async (tx) => {
    const rows = await tx
      .select({
        id: applications.id,
        status: applications.status,
        submittedAt: applications.submittedAt,
        updatedAt: applications.updatedAt,
        duplicateOf: applications.duplicateOf,
        guardianRequired: applications.guardianRequired,
        guardianConfirmedAt: applications.guardianConfirmedAt,
        source: sql<string | null>`${applications.attribution} ->> 'source'`,
        referralCode: applications.referralCode,
        name: applicants.fullName,
        email: applicants.email,
        state: applicants.state,
        college: applicants.college,
      })
      .from(applications)
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .where(where(f))
      .orderBy(desc(applications.submittedAt), desc(applications.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    const [total] = await tx
      .select({ n: count() })
      .from(applications)
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .where(where(f));
    return { rows, total: total?.n ?? 0, page, pageSize: PAGE_SIZE };
  });
}

export async function getApplicationDetail(session: StaffSession, id: string) {
  return withUserDb(session.claims, async (tx) => {
    const [row] = await tx
      .select({ application: applications, applicant: applicants })
      .from(applications)
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .where(eq(applications.id, id))
      .limit(1);
    if (!row) return null;
    const consents = await tx
      .select({
        kind: consentVersions.kind,
        version: consentVersions.version,
        granted: consentRecords.granted,
        recordedAt: consentRecords.recordedAt,
      })
      .from(consentRecords)
      .innerJoin(consentVersions, eq(consentVersions.id, consentRecords.consentVersionId))
      .where(eq(consentRecords.applicantId, row.applicant.id))
      .orderBy(desc(consentRecords.recordedAt));
    const [guardian] = await tx.select().from(guardianConsents).where(eq(guardianConsents.applicationId, id)).limit(1);
    const docs = await tx.select().from(documents).where(eq(documents.applicationId, id));
    return { ...row, consents, guardian: guardian ?? null, documents: docs };
  });
}

export async function applicationStats(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, async (tx) => {
    const byStatus = await tx
      .select({ status: applications.status, n: count() })
      .from(applications)
      .where(eq(applications.editionId, editionId))
      .groupBy(applications.status);
    const bySource = await tx
      .select({ source: sql<string>`coalesce(${applications.attribution} ->> 'source', case when ${applications.referralCode} is not null then 'ambassador' else 'direct' end)`, n: count() })
      .from(applications)
      .where(and(eq(applications.editionId, editionId), isNotNull(applications.submittedAt)))
      .groupBy(sql`1`)
      .orderBy(desc(count()));
    const byState = await tx
      .select({ state: sql<string>`coalesce(${applicants.state}, 'Unknown')`, n: count() })
      .from(applications)
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .where(and(eq(applications.editionId, editionId), isNotNull(applications.submittedAt)))
      .groupBy(sql`1`)
      .orderBy(desc(count()));
    return { byStatus, bySource, byState };
  });
}
