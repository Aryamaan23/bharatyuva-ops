"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { decisionBatches, interviewSlots, reviews, rubrics } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { validateScores, weightedTotal } from "@/server/domain/scoring";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { kickDelivery } from "@/server/messaging/send";
import { audit } from "@/server/privileged/audit";
import { applyDecisionBatch, assignPendingReviews, ensureRubric, generateSummaries, reviewerView } from "@/server/privileged/selection";

export async function assignReviewersAction(): Promise<{ message: string }> {
  const session = await requireStaff(ADMIN_ROLES);
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return { message: "No current edition." };
  await ensureRubric(edition.id);
  const r = await assignPendingReviews(edition.id, session.email);
  revalidatePath("/admin/selection");
  return { message: r.reason ?? `Created ${r.assigned} review assignments.` };
}

export async function generateSummariesAction(): Promise<{ message: string }> {
  const session = await requireStaff(ADMIN_ROLES);
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return { message: "No current edition." };
  const r = await generateSummaries(edition.id, session.email);
  revalidatePath("/admin/selection");
  return { message: r.error ?? `Generated ${r.done} summaries${r.failed ? `, ${r.failed} failed` : ""}${r.remaining ? `. ${r.remaining} still to do; run again.` : "."}` };
}

const criterionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
  label: z.string().trim().min(2).max(120),
  weight: z.coerce.number().int().min(1).max(10),
  max: z.coerce.number().int().min(1).max(10),
  guidance: z.string().max(400).optional(),
});

export async function saveRubricAction(criteria: z.input<typeof criterionSchema>[]): Promise<{ ok: boolean; error?: string }> {
  const session = await requireStaff(ADMIN_ROLES);
  const parsed = z.array(criterionSchema).min(1).max(12).safeParse(criteria);
  if (!parsed.success) return { ok: false, error: "Each criterion needs a key (lowercase), a label, a weight and a max score." };
  if (new Set(parsed.data.map((c) => c.key)).size !== parsed.data.length) return { ok: false, error: "Keys must be unique." };
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return { ok: false, error: "No current edition." };
  await withUserDb(session.claims, (tx) =>
    tx
      .insert(rubrics)
      .values({ editionId: edition.id, criteria: parsed.data, updatedBy: session.email })
      .onConflictDoUpdate({ target: rubrics.editionId, set: { criteria: parsed.data, updatedBy: session.email } }),
  );
  await audit({ actorEmail: session.email, action: "rubric.updated", entity: "edition", entityId: edition.id });
  revalidatePath("/admin/selection/rubric");
  return { ok: true };
}

export type ReviewResult = { ok: true } | { ok: false; errors: Record<string, string> };

/** Reviewer submits scores. Written under RLS: a reviewer can only score their own assignment. */
export async function submitReviewAction(input: { assignmentId: string; scores: Record<string, number>; comment: string }): Promise<ReviewResult> {
  const session = await requireStaff(["reviewer", "owner", "admin"]);
  const view = await reviewerView(z.uuid().parse(input.assignmentId), session.email);
  if (!view) return { ok: false, errors: { form: "This review isn't assigned to you." } };
  const errors = validateScores(view.rubric, input.scores);
  if (Object.keys(errors).length) return { ok: false, errors };
  const total = weightedTotal(view.rubric, input.scores);
  const scores = Object.fromEntries(view.rubric.map((c) => [c.key, input.scores[c.key]!]));
  await withUserDb(session.claims, async (tx) => {
    await tx
      .insert(reviews)
      .values({ assignmentId: input.assignmentId, scores, total, comment: input.comment.slice(0, 4000) || null })
      .onConflictDoUpdate({ target: reviews.assignmentId, set: { scores, total, comment: input.comment.slice(0, 4000) || null, submittedAt: new Date() } });
  });
  // Assignment status is admin-writable under RLS; mark it via the privileged layer's own check above.
  const { markAssignmentSubmitted } = await import("@/server/privileged/reviews");
  await markAssignmentSubmitted(input.assignmentId, session.email);
  revalidatePath("/admin/reviews");
  return { ok: true };
}

const batchSchema = z.object({ action: z.enum(["shortlisted", "interview", "selected", "waitlisted", "rejected"]), ids: z.array(z.uuid()).min(1).max(2000) });

/** Step 1 of a bulk decision: save it as a draft and go to the preview. Nothing is sent yet. */
export async function draftDecisionAction(input: z.input<typeof batchSchema>): Promise<void> {
  const session = await requireStaff(ADMIN_ROLES);
  const d = batchSchema.parse(input);
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return;
  const [batch] = await withUserDb(session.claims, (tx) =>
    tx.insert(decisionBatches).values({ editionId: edition.id, action: d.action, applicationIds: d.ids, createdBy: session.email }).returning({ id: decisionBatches.id }),
  );
  redirect(`/admin/selection/batch/${batch!.id}` as never);
}

/** Step 2: after previewing, send. */
export async function sendDecisionAction(formData: FormData): Promise<void> {
  const session = await requireStaff(ADMIN_ROLES);
  const id = z.uuid().parse(formData.get("batchId"));
  if (formData.get("confirm") !== "yes") return;
  await applyDecisionBatch(id, session.email);
  kickDelivery(500);
  revalidatePath("/admin/selection");
  redirect(`/admin/selection/batch/${id}` as never);
}

const slotsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  count: z.coerce.number().int().min(1).max(40),
  minutes: z.coerce.number().int().min(5).max(120),
  capacity: z.coerce.number().int().min(1).max(10),
  meetingLink: z.url().or(z.literal("")),
  interviewerEmail: z.string().max(254).optional(),
});

export async function createSlotsAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const d = slotsSchema.parse(Object.fromEntries(formData));
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return;
  const first = new Date(`${d.date}T${d.start}:00+05:30`);
  const values = Array.from({ length: d.count }, (_, i) => {
    const startsAt = new Date(first.getTime() + i * d.minutes * 60_000);
    return {
      editionId: edition.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + d.minutes * 60_000),
      capacity: d.capacity,
      meetingLink: d.meetingLink || null,
      interviewerEmail: d.interviewerEmail || session.email,
    };
  });
  await withUserDb(session.claims, (tx) => tx.insert(interviewSlots).values(values));
  revalidatePath("/admin/selection/interviews");
}

export async function deleteSlotAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = z.uuid().parse(formData.get("id"));
  await withUserDb(session.claims, (tx) => tx.delete(interviewSlots).where(eq(interviewSlots.id, id)));
  revalidatePath("/admin/selection/interviews");
}

