import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { adminDb } from "@/server/db/admin";
import { activities, editions, organisations, partnerships, sequenceSteps, staffMembers, tasks } from "@/server/db/schema";
import { daysUntil } from "@/server/domain/editions";
import { todayIst } from "@/server/domain/sequences";
import { enqueueEmail } from "@/server/messaging/outbox";
import type { JobResult } from "./runner";

/** One email per active staff member: their outreach queue, overdue tasks and fresh replies. */
export async function sendMorningDigests(now = new Date()): Promise<JobResult> {
  const db = adminDb();
  const [edition] = await db.select().from(editions).where(eq(editions.isCurrent, true)).limit(1);
  if (!edition) return { items: 0, detail: { reason: "no current edition" } };
  const today = todayIst(now);
  const since = new Date(now.getTime() - 24 * 3600_000);
  const staff = await db
    .select()
    .from(staffMembers)
    .where(and(eq(staffMembers.active, true), sql`${staffMembers.roles} && array['owner','admin','staff']::app.staff_role[]`));

  let sent = 0;
  for (const s of staff) {
    const queue = await db
      .select({ org: organisations.name, step: sequenceSteps.step })
      .from(sequenceSteps)
      .innerJoin(partnerships, eq(partnerships.id, sequenceSteps.partnershipId))
      .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
      .where(and(eq(partnerships.editionId, edition.id), eq(partnerships.ownerEmail, s.email), eq(sequenceSteps.status, "pending"), lte(sequenceSteps.dueAt, today), inArray(sequenceSteps.step, ["first", "fu1", "fu2"])));
    const myTasks = await db
      .select({ title: tasks.title, dueAt: tasks.dueAt })
      .from(tasks)
      .where(and(eq(tasks.editionId, edition.id), eq(tasks.ownerEmail, s.email), eq(tasks.status, "open"), lte(tasks.dueAt, today)))
      .orderBy(tasks.dueAt);
    const replies = await db
      .select({ org: organisations.name, kind: activities.kind, body: activities.body })
      .from(activities)
      .innerJoin(partnerships, eq(partnerships.id, activities.partnershipId))
      .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
      .where(and(eq(partnerships.ownerEmail, s.email), gte(activities.at, since), inArray(activities.kind, ["reply", "optout", "bounce", "partner_request"])));
    if (queue.length === 0 && myTasks.length === 0 && replies.length === 0) continue;

    const overdue = myTasks.filter((t) => t.dueAt && t.dueAt < today);
    const dueToday = myTasks.filter((t) => t.dueAt === today);
    const d1 = edition.day1Date ? daysUntil(edition.day1Date, now) : null;
    const lines = [
      `Good morning ${s.fullName.split(" ")[0]},`,
      "",
      d1 !== null ? `${d1} days until Day 1 of ${edition.name}.` : edition.name,
      "",
      `Outreach queue: ${queue.length} email${queue.length === 1 ? "" : "s"} to review and send.`,
      ...queue.slice(0, 15).map((q) => `  • ${q.org} (${q.step === "first" ? "first email" : q.step === "fu1" ? "follow-up 1" : "follow-up 2"})`),
      "",
      ...(replies.length ? [`New since yesterday:`, ...replies.map((r) => `  • ${r.org}: ${r.kind.replace("_", " ")}${r.body ? ` (“${r.body.slice(0, 80)}”)` : ""}`), ""] : []),
      ...(overdue.length ? [`Overdue tasks (${overdue.length}):`, ...overdue.slice(0, 10).map((t) => `  • ${t.title} (due ${t.dueAt})`), ""] : []),
      ...(dueToday.length ? [`Due today:`, ...dueToday.map((t) => `  • ${t.title}`), ""] : []),
      `Open your queue: ${env().NEXT_PUBLIC_APP_URL}/admin/outreach/queue`,
    ];
    const id = await enqueueEmail({
      idempotencyKey: `digest:${today}:${s.email}`,
      to: s.email,
      template: "morning_digest",
      email: { subject: `Bharat Yuva today: ${queue.length} to send, ${overdue.length} overdue`, html: null, text: lines.join("\n") },
      relatedEntity: "staff",
    });
    if (id) sent += 1;
  }
  return { items: sent, detail: { staff: staff.length } };
}
