import "server-only";
import { and, asc, count, eq, gt, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { allQuestions, type Answers, type FormDefinition } from "@/lib/forms/definition";
import { env } from "@/lib/env";
import type { SessionUser } from "@/server/auth/session";
import { summariseApplication } from "@/server/ai/prompts";
import { adminDb } from "@/server/db/admin";
import {
  aiSummaries,
  applicants,
  applications,
  decisionBatches,
  editions,
  interviewBookings,
  interviewSlots,
  reviewAssignments,
  reviews,
  rubrics,
  staffMembers,
  type ApplicationStatus,
} from "@/server/db/schema";
import { assignReviewers } from "@/server/domain/assignment";
import { formatDateTime } from "@/server/domain/editions";
import { DEFAULT_RUBRIC } from "@/server/domain/scoring";
import { offerExpired, openSeats, seatReminderDue, waitlistOrder } from "@/server/domain/waitlist";
import { enqueueEmail } from "@/server/messaging/outbox";
import * as templates from "@/server/messaging/templates";
import { audit } from "./audit";
import { getFormVersion } from "./editions";
import { queueWhatsapp } from "./whatsapp";

const appUrl = () => env().NEXT_PUBLIC_APP_URL;
const asLocale = (l: string): Locale => (isLocale(l) ? l : "en");

export async function ensureRubric(editionId: string) {
  const db = adminDb();
  const [r] = await db.select().from(rubrics).where(eq(rubrics.editionId, editionId)).limit(1);
  if (r) return r;
  const [created] = await db.insert(rubrics).values({ editionId, criteria: DEFAULT_RUBRIC, updatedBy: "default" }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(rubrics).where(eq(rubrics.editionId, editionId)).limit(1))[0]!;
}

/** Give every submitted application two reviewers, balancing current workloads. Idempotent. */
export async function assignPendingReviews(editionId: string, actorEmail: string, perApp = 2) {
  const db = adminDb();
  const reviewers = await db
    .select({ email: staffMembers.email })
    .from(staffMembers)
    .where(and(eq(staffMembers.active, true), sql`'reviewer' = any(${staffMembers.roles})`));
  if (reviewers.length === 0) return { assigned: 0, reason: "No active reviewers. Add people with the Reviewer role in Team." };

  const loads = await db
    .select({ email: reviewAssignments.reviewerEmail, n: count() })
    .from(reviewAssignments)
    .where(eq(reviewAssignments.status, "assigned"))
    .groupBy(reviewAssignments.reviewerEmail);
  const apps = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.editionId, editionId), inArray(applications.status, ["submitted", "under_review"])))
    .orderBy(asc(applications.submittedAt));
  const existingRows = apps.length
    ? await db.select().from(reviewAssignments).where(inArray(reviewAssignments.applicationId, apps.map((a) => a.id)))
    : [];
  const existing = new Map<string, Set<string>>();
  for (const r of existingRows) existing.set(r.applicationId, new Set([...(existing.get(r.applicationId) ?? []), r.reviewerEmail]));

  const plan = assignReviewers(
    apps.map((a) => a.id).filter((id) => (existing.get(id)?.size ?? 0) < perApp),
    reviewers.map((r) => ({ email: r.email, load: loads.find((l) => l.email === r.email)?.n ?? 0 })),
    existing,
    perApp,
  );
  const dueAt = new Date(Date.now() + 7 * 86_400_000);
  for (const a of plan) {
    await db.insert(reviewAssignments).values({ applicationId: a.applicationId, reviewerEmail: a.reviewerEmail, dueAt }).onConflictDoNothing();
  }
  const touched = [...new Set(plan.map((p) => p.applicationId))];
  if (touched.length) {
    await db.update(applications).set({ status: "under_review" }).where(and(inArray(applications.id, touched), eq(applications.status, "submitted")));
  }
  await audit({ actorEmail, action: "reviews.assigned", entity: "edition", entityId: editionId, after: { assignments: plan.length } });
  return { assigned: plan.length, reason: null };
}

/** Answers a reviewer may see: every question not marked PII, plus no contact or identity fields. */
export function anonymisedAnswers(def: FormDefinition, answers: Answers) {
  return allQuestions(def)
    .filter((q) => !q.pii && q.type !== "file" && q.type !== "email" && q.type !== "phone" && q.profileField !== "full_name" && q.profileField !== "phone" && q.profileField !== "date_of_birth" && q.profileField !== "gender")
    .map((q) => {
      const v = answers[q.id];
      const display = Array.isArray(v)
        ? v.map((x) => q.options?.find((o) => o.value === x)?.label.en ?? x).join(", ")
        : q.type === "single_choice"
          ? (q.options?.find((o) => o.value === v)?.label.en ?? v ?? "")
          : (v ?? "");
      return { id: q.id, question: q.label.en, answer: display };
    });
}

/** What a reviewer sees for one assignment. Returns null unless the assignment is theirs. */
export async function reviewerView(assignmentId: string, reviewerEmail: string) {
  const db = adminDb();
  const [row] = await db
    .select({ assignment: reviewAssignments, app: applications })
    .from(reviewAssignments)
    .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
    .where(and(eq(reviewAssignments.id, assignmentId), eq(reviewAssignments.reviewerEmail, reviewerEmail)))
    .limit(1);
  if (!row) return null;
  const form = await getFormVersion(row.app.editionId, row.app.formVersion);
  const rubric = await ensureRubric(row.app.editionId);
  const [summary] = await db.select().from(aiSummaries).where(eq(aiSummaries.applicationId, row.app.id)).limit(1);
  const [review] = await db.select().from(reviews).where(eq(reviews.assignmentId, assignmentId)).limit(1);
  return {
    assignment: row.assignment,
    // Reviewers see a short reference, never the applicant's name or ID.
    reference: `#${row.app.id.slice(0, 6).toUpperCase()}`,
    answers: form ? anonymisedAnswers(form.definition, row.app.answers) : [],
    summary: summary?.summary ?? null,
    rubric: rubric.criteria,
    review: review ?? null,
  };
}

export async function reviewerQueue(reviewerEmail: string) {
  return adminDb()
    .select({ id: reviewAssignments.id, status: reviewAssignments.status, dueAt: reviewAssignments.dueAt, applicationId: reviewAssignments.applicationId, total: reviews.total })
    .from(reviewAssignments)
    .leftJoin(reviews, eq(reviews.assignmentId, reviewAssignments.id))
    .where(eq(reviewAssignments.reviewerEmail, reviewerEmail))
    .orderBy(sql`case ${reviewAssignments.status} when 'assigned' then 0 else 1 end`, asc(reviewAssignments.createdAt));
}

/** Generate missing AI summaries (anonymised input only). Batched to fit a 60 s function. */
export async function generateSummaries(editionId: string, actorEmail: string, limit = 15) {
  const db = adminDb();
  const pending = await db
    .select({ app: applications })
    .from(applications)
    .leftJoin(aiSummaries, eq(aiSummaries.applicationId, applications.id))
    .where(and(eq(applications.editionId, editionId), notInArray(applications.status, ["draft", "withdrawn"]), isNull(aiSummaries.id)))
    .limit(limit);
  let done = 0;
  let failed = 0;
  for (const { app } of pending) {
    const form = await getFormVersion(editionId, app.formVersion);
    if (!form) continue;
    const answers = anonymisedAnswers(form.definition, app.answers).filter((a) => a.answer && a.answer.length > 0);
    const res = await summariseApplication({ applicationId: app.id, actorEmail, answers: answers.map((a) => ({ question: a.question, answer: String(a.answer) })) });
    if (!res.ok) {
      failed += 1;
      if (res.error === "not_configured") return { done, failed, remaining: pending.length, error: "AI isn't configured (ANTHROPIC_API_KEY)." };
      continue;
    }
    await db.insert(aiSummaries).values({ applicationId: app.id, model: env().ANTHROPIC_MODEL, summary: res.text }).onConflictDoNothing();
    done += 1;
  }
  return { done, failed, remaining: Math.max(0, pending.length - done), error: null };
}

/** When a seat offer made now would expire (for previews). */
export function offerExpiryFromNow(seatConfirmHours: number): Date {
  return new Date(Date.now() + seatConfirmHours * 3600_000);
}

export type DecisionAction = "shortlisted" | "interview" | "selected" | "waitlisted" | "rejected";

/** Render the email an applicant would receive for a decision (used for previews and sending). */
export function renderDecision(action: DecisionAction, locale: Locale, v: { name: string; editionName: string; expiresAt?: Date | null }) {
  const portalUrl = `${appUrl()}/${locale}/me`;
  if (action === "selected") {
    return templates.seatOffer(locale, { name: v.name, editionName: v.editionName, expiresAt: v.expiresAt ? formatDateTime(v.expiresAt, locale) : "", portalUrl });
  }
  return templates.decisionEmail(locale, action, { name: v.name, editionName: v.editionName, portalUrl });
}

/** Send a previewed decision batch: status changes, emails, WhatsApp. Safe to retry. */
export async function applyDecisionBatch(batchId: string, actorEmail: string) {
  const db = adminDb();
  const [batch] = await db.select().from(decisionBatches).where(eq(decisionBatches.id, batchId)).limit(1);
  if (!batch || batch.status !== "draft") return { ok: false as const, error: "This batch was already sent or doesn't exist." };
  await db.update(decisionBatches).set({ status: "sending" }).where(and(eq(decisionBatches.id, batchId), eq(decisionBatches.status, "draft")));
  const action = batch.action as DecisionAction;
  const [edition] = await db.select().from(editions).where(eq(editions.id, batch.editionId)).limit(1);
  const rows = await db
    .select({ app: applications, applicant: applicants })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .where(inArray(applications.id, batch.applicationIds));

  // Waitlist ranks continue after anyone already waitlisted.
  const [maxRank] = await db.select({ m: sql<number>`coalesce(max(${applications.waitlistRank}), 0)::int` }).from(applications).where(eq(applications.editionId, batch.editionId));
  let rank = maxRank?.m ?? 0;
  const ordered = action === "waitlisted" ? batch.applicationIds.map((id) => rows.find((r) => r.app.id === id)!).filter(Boolean) : rows;

  let sent = 0;
  for (const { app, applicant } of ordered) {
    const locale = asLocale(app.locale);
    const expiresAt = action === "selected" ? new Date(Date.now() + edition!.seatConfirmHours * 3600_000) : null;
    const status: ApplicationStatus = action;
    await db
      .update(applications)
      .set({
        status,
        seatOfferExpiresAt: action === "selected" ? expiresAt : app.seatOfferExpiresAt,
        waitlistRank: action === "waitlisted" ? ++rank : app.waitlistRank,
      })
      .where(eq(applications.id, app.id));
    const email = renderDecision(action, locale, { name: applicant.fullName ?? "", editionName: edition!.name, expiresAt });
    const id = await enqueueEmail({
      idempotencyKey: `decision:${action}:${app.id}`,
      to: applicant.email,
      template: `decision_${action}`,
      email,
      relatedEntity: "application",
      relatedId: app.id,
    });
    await queueWhatsapp({
      applicationId: app.id,
      kind: action === "selected" ? "seat_offer" : "status_update",
      params: [applicant.fullName ?? "", edition!.name, getDictionary(locale).portal.status[status]],
      idempotencyKey: `wa:decision:${action}:${app.id}`,
      preview: email.subject,
    });
    await audit({ actorEmail, action: "application.status_changed", entity: "application", entityId: app.id, before: { status: app.status }, after: { status, batch: batchId } });
    if (id) sent += 1;
  }
  await db.update(decisionBatches).set({ status: "sent", sentBy: actorEmail, sentAt: new Date(), result: { emails: sent, applications: rows.length } }).where(eq(decisionBatches.id, batchId));
  return { ok: true as const, sent, applications: rows.length };
}

/** Evening: remind, expire and refill seats from the waitlist. Idempotent. */
export async function runSeatAutomation(now = new Date()) {
  const db = adminDb();
  const result = { reminders: 0, expired: 0, promoted: 0 };
  const live = await db
    .select({ app: applications, applicant: applicants, edition: editions })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .innerJoin(editions, eq(editions.id, applications.editionId))
    .where(eq(applications.status, "selected"));
  for (const { app, applicant, edition } of live) {
    const locale = asLocale(app.locale);
    if (offerExpired(app.seatOfferExpiresAt, now)) {
      await db.update(applications).set({ status: "declined", seatRespondedAt: null }).where(and(eq(applications.id, app.id), eq(applications.status, "selected")));
      await audit({ actorEmail: "system", action: "application.offer_expired", entity: "application", entityId: app.id });
      result.expired += 1;
    } else if (seatReminderDue(app.seatOfferExpiresAt, now)) {
      const id = await enqueueEmail({
        idempotencyKey: `seat-reminder:${app.id}:${app.seatOfferExpiresAt!.toISOString()}`,
        to: applicant.email,
        template: "seat_reminder",
        email: templates.seatReminder(locale, { name: applicant.fullName ?? "", editionName: edition.name, expiresAt: formatDateTime(app.seatOfferExpiresAt!, locale), portalUrl: `${appUrl()}/${locale}/me` }),
        relatedEntity: "application",
        relatedId: app.id,
      });
      if (id) result.reminders += 1;
    }
  }
  // Refill seats in every edition that still has a waitlist (not only the current one).
  const withWaitlist = await db.selectDistinct({ id: applications.editionId }).from(applications).where(eq(applications.status, "waitlisted"));
  for (const e of withWaitlist) result.promoted += await promoteWaitlist(e.id, now);
  return result;
}

/** Offer free seats to the next people on the waitlist. */
export async function promoteWaitlist(editionId: string, now = new Date()): Promise<number> {
  const db = adminDb();
  const [edition] = await db.select().from(editions).where(eq(editions.id, editionId)).limit(1);
  if (!edition) return 0;
  const [offers] = await db
    .select({ n: count() })
    .from(applications)
    .where(and(eq(applications.editionId, editionId), eq(applications.status, "selected"), gt(applications.seatOfferExpiresAt, now)));
  const [confirmed] = await db
    .select({ n: count() })
    .from(applications)
    .where(and(eq(applications.editionId, editionId), inArray(applications.status, ["confirmed", "attended"])));
  const free = openSeats(edition.seats, offers?.n ?? 0, confirmed?.n ?? 0);
  if (free === 0) return 0;
  const waitlisted = await db
    .select({ app: applications, applicant: applicants })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .where(and(eq(applications.editionId, editionId), eq(applications.status, "waitlisted")));
  const next = waitlistOrder(waitlisted.map((w) => ({ ...w, waitlistRank: w.app.waitlistRank, mean: null }))).slice(0, free);
  for (const { app, applicant } of next) {
    const expiresAt = new Date(now.getTime() + edition.seatConfirmHours * 3600_000);
    const [updated] = await db
      .update(applications)
      .set({ status: "selected", seatOfferExpiresAt: expiresAt })
      .where(and(eq(applications.id, app.id), eq(applications.status, "waitlisted")))
      .returning({ id: applications.id });
    if (!updated) continue;
    const locale = asLocale(app.locale);
    await enqueueEmail({
      idempotencyKey: `waitlist-offer:${app.id}:${expiresAt.toISOString().slice(0, 10)}`,
      to: applicant.email,
      template: "waitlist_offer",
      email: renderDecision("selected", locale, { name: applicant.fullName ?? "", editionName: edition.name, expiresAt }),
      relatedEntity: "application",
      relatedId: app.id,
    });
    await audit({ actorEmail: "system", action: "application.waitlist_promoted", entity: "application", entityId: app.id });
  }
  return next.length;
}

// ---------------------------------------------------------------- Interviews (applicant side)

export async function availableSlots(editionId: string, applicationId: string) {
  const db = adminDb();
  const slots = await db
    .select({ slot: interviewSlots, booked: sql<number>`(select count(*)::int from app.interview_bookings b where b.slot_id = ${interviewSlots.id})` })
    .from(interviewSlots)
    .where(and(eq(interviewSlots.editionId, editionId), gt(interviewSlots.startsAt, new Date())))
    .orderBy(asc(interviewSlots.startsAt));
  const [mine] = await db.select().from(interviewBookings).where(eq(interviewBookings.applicationId, applicationId)).limit(1);
  return { slots: slots.filter((s) => s.booked < s.slot.capacity || s.slot.id === mine?.slotId), mySlotId: mine?.slotId ?? null };
}

export async function bookInterview(user: SessionUser, applicationId: string, slotId: string): Promise<"booked" | "full" | "not_allowed"> {
  const db = adminDb();
  const [own] = await db
    .select({ app: applications, applicant: applicants, edition: editions })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .innerJoin(editions, eq(editions.id, applications.editionId))
    .where(and(eq(applications.id, applicationId), eq(applicants.userId, user.id)))
    .limit(1);
  if (!own || own.app.status !== "interview") return "not_allowed";
  const outcome = await db.transaction(async (tx) => {
    // Lock the slot row so two applicants can't take the last place at once.
    const [slot] = await tx.select().from(interviewSlots).where(and(eq(interviewSlots.id, slotId), eq(interviewSlots.editionId, own.edition.id))).for("update");
    if (!slot || slot.startsAt <= new Date()) return { kind: "not_allowed" as const };
    const [taken] = await tx.select({ n: count() }).from(interviewBookings).where(and(eq(interviewBookings.slotId, slotId), sql`${interviewBookings.applicationId} <> ${applicationId}`));
    if ((taken?.n ?? 0) >= slot.capacity) return { kind: "full" as const };
    await tx.insert(interviewBookings).values({ slotId, applicationId }).onConflictDoUpdate({ target: interviewBookings.applicationId, set: { slotId } });
    return { kind: "booked" as const, slot };
  });
  if (outcome.kind !== "booked") return outcome.kind;
  const locale = asLocale(own.app.locale);
  await enqueueEmail({
    idempotencyKey: `interview-booked:${applicationId}:${slotId}`,
    to: own.applicant.email,
    template: "interview_booked",
    email: templates.interviewBooked(locale, { name: own.applicant.fullName ?? "", editionName: own.edition.name, when: formatDateTime(outcome.slot.startsAt, locale), link: outcome.slot.meetingLink, portalUrl: `${appUrl()}/${locale}/me` }),
    relatedEntity: "application",
    relatedId: applicationId,
  });
  await audit({ actorEmail: user.email, action: "interview.booked", entity: "application", entityId: applicationId, after: { slotId } });
  return "booked";
}

export async function dueSummaryCount(editionId: string) {
  const [row] = await adminDb()
    .select({ n: count() })
    .from(applications)
    .leftJoin(aiSummaries, eq(aiSummaries.applicationId, applications.id))
    .where(and(eq(applications.editionId, editionId), notInArray(applications.status, ["draft", "withdrawn"]), isNull(aiSummaries.id)));
  return row?.n ?? 0;
}

