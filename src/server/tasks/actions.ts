"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_TIMELINE } from "@/content/timeline";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { editions, tasks, taskTemplates, type ChecklistItem, type TemplateTask } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { planTimeline } from "@/server/domain/timeline";
import { audit } from "@/server/privileged/audit";

export type TimelineResult = { ok: true; created: number } | { ok: false; error: string };

/** Create this edition's timeline tasks from a template, dated backwards from Day 1. Idempotent. */
export async function generateTimelineAction(formData: FormData): Promise<void> {
  const session = await requireStaff(ADMIN_ROLES);
  const d = z.object({ editionId: z.uuid(), templateId: z.uuid().or(z.literal("")).optional() }).parse(Object.fromEntries(formData));
  await withUserDb(session.claims, async (tx) => {
    const [edition] = await tx.select().from(editions).where(eq(editions.id, d.editionId)).limit(1);
    if (!edition?.day1Date) return;
    let template: TemplateTask[] = DEFAULT_TIMELINE;
    if (d.templateId) {
      const [t] = await tx.select().from(taskTemplates).where(eq(taskTemplates.id, d.templateId)).limit(1);
      if (t) template = t.tasks;
    }
    for (const t of planTimeline(edition.day1Date, template)) {
      await tx
        .insert(tasks)
        .values({ editionId: edition.id, title: t.title, kind: "timeline", ownerEmail: t.ownerEmail, dueAt: t.dueAt, offsetDays: t.offsetDays, sourceKey: `timeline:${t.offsetDays}:${t.title}` })
        .onConflictDoUpdate({ target: [tasks.editionId, tasks.sourceKey], set: { dueAt: t.dueAt } });
    }
  });
  await audit({ actorEmail: session.email, action: "timeline.generated", entity: "edition", entityId: d.editionId });
  revalidatePath("/admin/tasks");
}

export async function saveTimelineAsTemplateAction(formData: FormData): Promise<void> {
  const session = await requireStaff(ADMIN_ROLES);
  const d = z.object({ editionId: z.uuid(), name: z.string().trim().min(3).max(120) }).parse(Object.fromEntries(formData));
  await withUserDb(session.claims, async (tx) => {
    const rows = await tx
      .select({ title: tasks.title, offsetDays: tasks.offsetDays, ownerEmail: tasks.ownerEmail })
      .from(tasks)
      .where(and(eq(tasks.editionId, d.editionId), eq(tasks.kind, "timeline"), isNotNull(tasks.offsetDays)));
    await tx.insert(taskTemplates).values({
      name: d.name,
      tasks: rows.map((r) => ({ title: r.title, offsetDays: r.offsetDays!, ownerEmail: r.ownerEmail })),
      createdBy: session.email,
    });
  });
  await audit({ actorEmail: session.email, action: "timeline.saved_as_template", entity: "edition", entityId: d.editionId, after: { name: d.name } });
  revalidatePath("/admin/tasks");
}

const updateSchema = z.object({
  id: z.uuid(),
  status: z.enum(["open", "done", "skipped"]).optional(),
  ownerEmail: z.string().max(254).optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional(),
});

export async function updateTaskAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const d = updateSchema.parse(Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$"))));
  const set: Partial<typeof tasks.$inferInsert> = {};
  if (d.status) {
    set.status = d.status;
    set.completedAt = d.status === "done" ? new Date() : null;
  }
  if (d.ownerEmail !== undefined) set.ownerEmail = d.ownerEmail || null;
  if (d.dueAt !== undefined) set.dueAt = d.dueAt || null;
  await withUserDb(session.claims, (tx) => tx.update(tasks).set(set).where(eq(tasks.id, d.id)));
  revalidatePath("/admin/tasks");
  revalidatePath("/admin");
}

export async function toggleChecklistAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const d = z.object({ id: z.uuid(), index: z.coerce.number().int().min(0).max(50) }).parse(Object.fromEntries(formData));
  await withUserDb(session.claims, async (tx) => {
    const [t] = await tx.select({ checklist: tasks.checklist }).from(tasks).where(eq(tasks.id, d.id)).limit(1);
    if (!t) return;
    const checklist: ChecklistItem[] = t.checklist.map((item, i) => (i === d.index ? { ...item, done: !item.done } : item));
    await tx.update(tasks).set({ checklist }).where(eq(tasks.id, d.id));
  });
  revalidatePath("/admin/tasks");
}

export async function addTaskAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const d = z
    .object({ editionId: z.uuid(), title: z.string().trim().min(3).max(200), dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")), ownerEmail: z.string().max(254).optional() })
    .parse(Object.fromEntries(formData));
  await withUserDb(session.claims, (tx) => tx.insert(tasks).values({ editionId: d.editionId, title: d.title, kind: "other", dueAt: d.dueAt || null, ownerEmail: d.ownerEmail || session.email }));
  revalidatePath("/admin/tasks");
}
