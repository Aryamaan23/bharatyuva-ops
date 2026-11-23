import "server-only";
import { count, desc, eq, sql } from "drizzle-orm";
import type { StaffSession } from "@/server/auth/session";
import { auditLog, jobRuns, outboundMessages } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";

export async function latestJobRuns(session: StaffSession) {
  return withUserDb(session.claims, (tx) =>
    tx
      .selectDistinctOn([jobRuns.job])
      .from(jobRuns)
      .orderBy(jobRuns.job, desc(jobRuns.startedAt)),
  );
}

export async function recentJobRuns(session: StaffSession, limit = 30) {
  return withUserDb(session.claims, (tx) => tx.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(limit));
}

export async function outboxSummary(session: StaffSession) {
  return withUserDb(session.claims, async (tx) => {
    const byStatus = await tx
      .select({ status: outboundMessages.status, n: count() })
      .from(outboundMessages)
      .groupBy(outboundMessages.status);
    const failed = await tx
      .select({
        id: outboundMessages.id,
        template: outboundMessages.template,
        to: outboundMessages.toAddress,
        attempts: outboundMessages.attempts,
        lastError: outboundMessages.lastError,
        updatedAt: outboundMessages.updatedAt,
      })
      .from(outboundMessages)
      .where(eq(outboundMessages.status, "failed"))
      .orderBy(desc(outboundMessages.updatedAt))
      .limit(20);
    const sentToday = await tx
      .select({ n: count() })
      .from(outboundMessages)
      .where(sql`${outboundMessages.sentAt} >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' and ${outboundMessages.status} in ('sent', 'redirected')`);
    return { byStatus, failed, sentToday: sentToday[0]?.n ?? 0 };
  });
}

export async function recentAudit(session: StaffSession, entity?: string) {
  return withUserDb(session.claims, (tx) =>
    tx
      .select()
      .from(auditLog)
      .where(entity ? eq(auditLog.entity, entity) : undefined)
      .orderBy(desc(auditLog.at))
      .limit(200),
  );
}
