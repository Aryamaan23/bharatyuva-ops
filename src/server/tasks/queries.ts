import "server-only";
import { and, asc, eq, isNull, lt, or, type SQL } from "drizzle-orm";
import type { StaffSession } from "@/server/auth/session";
import { organisations, partnerships, tasks, taskTemplates } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { todayIst } from "@/server/domain/sequences";

export type TaskFilter = "mine" | "all" | "overdue" | "unassigned" | "done";

export async function listTasks(session: StaffSession, editionId: string, filter: TaskFilter) {
  const conds: (SQL | undefined)[] = [eq(tasks.editionId, editionId)];
  if (filter === "done") conds.push(eq(tasks.status, "done"));
  else conds.push(eq(tasks.status, "open"));
  if (filter === "mine") conds.push(eq(tasks.ownerEmail, session.email));
  if (filter === "unassigned") conds.push(isNull(tasks.ownerEmail));
  if (filter === "overdue") conds.push(lt(tasks.dueAt, todayIst()));
  return withUserDb(session.claims, (tx) =>
    tx
      .select({ task: tasks, orgName: organisations.name })
      .from(tasks)
      .leftJoin(partnerships, eq(partnerships.id, tasks.partnershipId))
      .leftJoin(organisations, eq(organisations.id, partnerships.organisationId))
      .where(and(...conds))
      .orderBy(asc(tasks.dueAt), asc(tasks.offsetDays))
      .limit(500),
  );
}

export async function taskCounts(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, async (tx) => {
    const open = await tx.select({ dueAt: tasks.dueAt, ownerEmail: tasks.ownerEmail }).from(tasks).where(and(eq(tasks.editionId, editionId), eq(tasks.status, "open")));
    const today = todayIst();
    return {
      open: open.length,
      overdue: open.filter((t) => t.dueAt && t.dueAt < today).length,
      mineOverdue: open.filter((t) => t.dueAt && t.dueAt < today && t.ownerEmail === session.email).length,
    };
  });
}

export async function overdueTasks(session: StaffSession, editionId: string, limit = 8) {
  return withUserDb(session.claims, (tx) =>
    tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.editionId, editionId), eq(tasks.status, "open"), or(lt(tasks.dueAt, todayIst()), eq(tasks.dueAt, todayIst()))))
      .orderBy(asc(tasks.dueAt))
      .limit(limit),
  );
}

export async function listTaskTemplates(session: StaffSession) {
  return withUserDb(session.claims, (tx) => tx.select().from(taskTemplates).orderBy(asc(taskTemplates.name)));
}
