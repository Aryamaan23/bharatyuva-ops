import { sql } from "drizzle-orm";
import { index, integer, jsonb, numeric, pgPolicy, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";
import { app, id, rls, timestamps } from "./_shared";
import { applications } from "./applications";
import { editions } from "./editions";

const isReviewer = sql`app_private.has_role('reviewer')`;

export type RubricCriterion = { key: string; label: string; weight: number; max: number; guidance?: string };

export const rubrics = app.table(
  "rubrics",
  {
    id: id(),
    editionId: uuid("edition_id")
      .notNull()
      .unique()
      .references(() => editions.id, { onDelete: "cascade" }),
    criteria: jsonb("criteria").$type<RubricCriterion[]>().notNull(),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  () => [
    pgPolicy("rubrics_staff_or_reviewer_select", { for: "select", to: authenticatedRole, using: sql`${rls.isStaff} or ${isReviewer}` }),
    pgPolicy("rubrics_admin_write", { for: "all", to: authenticatedRole, using: rls.isAdmin, withCheck: rls.isAdmin }),
  ],
);

export const reviewAssignments = app.table(
  "review_assignments",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    reviewerEmail: text("reviewer_email").notNull(),
    status: text("status").notNull().default("assigned"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("review_assignments_app_reviewer").on(t.applicationId, t.reviewerEmail),
    index("review_assignments_reviewer").on(t.reviewerEmail, t.status),
    pgPolicy("review_assignments_own_select", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.reviewerEmail} = app_private.current_email() or ${rls.isStaff}`,
    }),
    pgPolicy("review_assignments_admin_write", { for: "all", to: authenticatedRole, using: rls.isAdmin, withCheck: rls.isAdmin }),
  ],
);

export const reviews = app.table(
  "reviews",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .unique()
      .references(() => reviewAssignments.id, { onDelete: "cascade" }),
    scores: jsonb("scores").$type<Record<string, number>>().notNull(),
    /** Weighted total as a percentage (0-100). */
    total: numeric("total", { precision: 5, scale: 2, mode: "number" }).notNull(),
    comment: text("comment"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    pgPolicy("reviews_own_or_staff_select", {
      for: "select",
      to: authenticatedRole,
      using: sql`${rls.isStaff} or exists (select 1 from app.review_assignments a where a.id = ${t.assignmentId} and a.reviewer_email = app_private.current_email())`,
    }),
    pgPolicy("reviews_own_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`exists (select 1 from app.review_assignments a where a.id = ${t.assignmentId} and a.reviewer_email = app_private.current_email())`,
    }),
    pgPolicy("reviews_own_update", {
      for: "update",
      to: authenticatedRole,
      using: sql`exists (select 1 from app.review_assignments a where a.id = ${t.assignmentId} and a.reviewer_email = app_private.current_email())`,
      withCheck: sql`exists (select 1 from app.review_assignments a where a.id = ${t.assignmentId} and a.reviewer_email = app_private.current_email())`,
    }),
  ],
);

export const aiSummaries = app.table(
  "ai_summaries",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .unique()
      .references(() => applications.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    summary: text("summary").notNull(),
    ...timestamps,
  },
  () => [pgPolicy("ai_summaries_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff })],
);

export const interviewSlots = app.table(
  "interview_slots",
  {
    id: id(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    capacity: integer("capacity").notNull().default(1),
    meetingLink: text("meeting_link"),
    interviewerEmail: text("interviewer_email"),
    ...timestamps,
  },
  (t) => [
    index("interview_slots_edition").on(t.editionId, t.startsAt),
    pgPolicy("interview_slots_staff_all", { for: "all", to: authenticatedRole, using: rls.isStaff, withCheck: rls.isStaff }),
  ],
);

export const interviewBookings = app.table(
  "interview_bookings",
  {
    id: id(),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => interviewSlots.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .unique()
      .references(() => applications.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  () => [pgPolicy("interview_bookings_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff })],
);

export const decisionBatches = app.table(
  "decision_batches",
  {
    id: id(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    applicationIds: uuid("application_ids").array().notNull(),
    status: text("status").notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    sentBy: text("sent_by"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    result: jsonb("result").notNull().default({}),
    ...timestamps,
  },
  () => [
    pgPolicy("decision_batches_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
    pgPolicy("decision_batches_admin_write", { for: "all", to: authenticatedRole, using: rls.isAdmin, withCheck: rls.isAdmin }),
  ],
);

export const ambassadorStatus = app.enum("ambassador_status", ["pending", "approved", "rejected"]);

export const ambassadors = app.table(
  "ambassadors",
  {
    id: id(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => authUsers.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    college: text("college").notNull(),
    phone: text("phone"),
    motivation: text("motivation"),
    code: text("code").unique(),
    status: ambassadorStatus("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ambassadors_edition_email").on(t.editionId, t.email),
    pgPolicy("ambassadors_own_select", { for: "select", to: authenticatedRole, using: sql`${t.email} = app_private.current_email() or ${rls.isStaff}` }),
    pgPolicy("ambassadors_staff_update", { for: "update", to: authenticatedRole, using: rls.isStaff, withCheck: rls.isStaff }),
  ],
);
