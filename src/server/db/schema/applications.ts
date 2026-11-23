import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgPolicy,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";
import type { Answers } from "@/lib/forms/definition";
import { app, id, rls, timestamps } from "./_shared";
import { consentVersions, editions } from "./editions";

/** One row per person across editions (alumni carry over). */
export const applicants = app.table(
  "applicants",
  {
    id: id(),
    userId: uuid("user_id")
      .unique()
      .references(() => authUsers.id, { onDelete: "set null" }),
    email: text("email").notNull().unique(),
    /** Lower-cased, Gmail dots/+tags removed: used for duplicate detection only. */
    emailCanonical: text("email_canonical").notNull(),
    phoneE164: text("phone_e164"),
    fullName: text("full_name"),
    dateOfBirth: date("date_of_birth"),
    state: text("state"),
    college: text("college"),
    gender: text("gender"),
    ...timestamps,
  },
  (t) => [
    index("applicants_email_canonical").on(t.emailCanonical),
    index("applicants_phone").on(t.phoneE164),
    pgPolicy("applicants_own_select", { for: "select", to: authenticatedRole, using: sql`${t.userId} = ${rls.uid}` }),
    pgPolicy("applicants_own_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.userId} = ${rls.uid} and lower(${t.email}) = app_private.current_email()`,
    }),
    pgPolicy("applicants_own_update", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.userId} = ${rls.uid}`,
      withCheck: sql`${t.userId} = ${rls.uid} and lower(${t.email}) = app_private.current_email()`,
    }),
    pgPolicy("applicants_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
    pgPolicy("applicants_admin_update", {
      for: "update",
      to: authenticatedRole,
      using: rls.isAdmin,
      withCheck: rls.isAdmin,
    }),
  ],
);

export const applicationStatus = app.enum("application_status", [
  "draft",
  "submitted",
  "under_review",
  "shortlisted",
  "interview",
  "selected",
  "waitlisted",
  "rejected",
  "withdrawn",
  "confirmed",
  "declined",
  "attended",
]);
export type ApplicationStatus = (typeof applicationStatus.enumValues)[number];

export type Attribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  landingPath?: string;
  firstSeenAt?: string;
};

export const applications = app.table(
  "applications",
  {
    id: id(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "restrict" }),
    applicantId: uuid("applicant_id")
      .notNull()
      .references(() => applicants.id, { onDelete: "cascade" }),
    formVersion: integer("form_version").notNull(),
    answers: jsonb("answers").$type<Answers>().notNull().default({}),
    currentStep: integer("current_step").notNull().default(0),
    status: applicationStatus("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    locale: text("locale").notNull().default("en"),
    attribution: jsonb("attribution").$type<Attribution>().notNull().default({}),
    referralCode: text("referral_code"),
    whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
    duplicateOf: uuid("duplicate_of"),
    duplicateReason: text("duplicate_reason"),
    guardianRequired: boolean("guardian_required").notNull().default(false),
    guardianConfirmedAt: timestamp("guardian_confirmed_at", { withTimezone: true }),
    seatOfferExpiresAt: timestamp("seat_offer_expires_at", { withTimezone: true }),
    seatRespondedAt: timestamp("seat_responded_at", { withTimezone: true }),
    waitlistRank: integer("waitlist_rank"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("applications_edition_applicant").on(t.editionId, t.applicantId),
    index("applications_edition_status").on(t.editionId, t.status),
    index("applications_referral").on(t.referralCode),
    // Applicants can read their own application and edit it only while it is a draft.
    // Status changes beyond draft→submitted happen through privileged server code.
    pgPolicy("applications_own_select", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.applicantId} = ${rls.currentApplicantId}`,
    }),
    pgPolicy("applications_own_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.applicantId} = ${rls.currentApplicantId} and ${t.status} = 'draft'`,
    }),
    pgPolicy("applications_own_update_draft", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.applicantId} = ${rls.currentApplicantId} and ${t.status} = 'draft'`,
      withCheck: sql`${t.applicantId} = ${rls.currentApplicantId} and ${t.status} in ('draft', 'submitted')`,
    }),
    pgPolicy("applications_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
    pgPolicy("applications_staff_update", {
      for: "update",
      to: authenticatedRole,
      using: rls.isStaff,
      withCheck: rls.isStaff,
    }),
  ],
);

export const consentRecords = app.table(
  "consent_records",
  {
    id: id(),
    applicantId: uuid("applicant_id")
      .notNull()
      .references(() => applicants.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "cascade" }),
    consentVersionId: uuid("consent_version_id")
      .notNull()
      .references(() => consentVersions.id),
    granted: boolean("granted").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("consent_records_applicant").on(t.applicantId),
    // Consent history is append-only: own insert/select, staff select. No updates or deletes.
    pgPolicy("consent_records_own_select", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.applicantId} = ${rls.currentApplicantId}`,
    }),
    pgPolicy("consent_records_own_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.applicantId} = ${rls.currentApplicantId}`,
    }),
    pgPolicy("consent_records_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
  ],
);

export const guardianConsents = app.table(
  "guardian_consents",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .unique()
      .references(() => applications.id, { onDelete: "cascade" }),
    guardianName: text("guardian_name").notNull(),
    guardianEmail: text("guardian_email").notNull(),
    guardianRelation: text("guardian_relation").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    pgPolicy("guardian_consents_own_select", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from app.applications a where a.id = ${t.applicationId} and a.applicant_id = ${rls.currentApplicantId})`,
    }),
    pgPolicy("guardian_consents_own_insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`exists (select 1 from app.applications a where a.id = ${t.applicationId} and a.applicant_id = ${rls.currentApplicantId})`,
    }),
    pgPolicy("guardian_consents_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
  ],
);

export const documents = app.table(
  "documents",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("documents_application_kind").on(t.applicationId, t.kind),
    pgPolicy("documents_own_select", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from app.applications a where a.id = ${t.applicationId} and a.applicant_id = ${rls.currentApplicantId})`,
    }),
    pgPolicy("documents_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
  ],
);

export const deletionStatus = app.enum("deletion_status", [
  "pending_verification",
  "verified",
  "completed",
  "rejected",
]);

export const deletionRequests = app.table(
  "deletion_requests",
  {
    id: id(),
    /** Kept after completion as proof the request was honoured. */
    emailHash: text("email_hash").notNull(),
    /** Cleared once the request is completed or rejected. */
    email: text("email"),
    kind: text("kind").notNull().default("delete"),
    reason: text("reason"),
    status: deletionStatus("status").notNull().default("pending_verification"),
    tokenHash: text("token_hash").notNull().unique(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    processedBy: text("processed_by"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  () => [
    pgPolicy("deletion_requests_admin", { for: "all", to: authenticatedRole, using: rls.isAdmin, withCheck: rls.isAdmin }),
  ],
);
