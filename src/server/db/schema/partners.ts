import { sql } from "drizzle-orm";
import {
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
import { authenticatedRole } from "drizzle-orm/supabase";
import { app, id, rls, timestamps } from "./_shared";
import { editions } from "./editions";
import { outboundMessages } from "./platform";

export const partnerType = app.enum("partner_type", ["university", "district", "embassy", "other"]);
export type PartnerType = (typeof partnerType.enumValues)[number];

export const partnerStage = app.enum("partner_stage", [
  "not_contacted",
  "email_sent",
  "follow_up_1",
  "follow_up_2",
  "in_discussion",
  "confirmed",
  "declined",
  "do_not_contact",
]);
export type PartnerStage = (typeof partnerStage.enumValues)[number];

export const temperature = app.enum("temperature", ["hot", "warm", "cold"]);
export type Temperature = (typeof temperature.enumValues)[number];

export const contactChannel = app.enum("contact_channel", ["email", "form", "phone"]);

/** Staff (owner/admin/staff) can read and write CRM data; only admins can delete. */
const staffCrud = (name: string) => [
  pgPolicy(`${name}_staff_select`, { for: "select", to: authenticatedRole, using: rls.isStaff }),
  pgPolicy(`${name}_staff_insert`, { for: "insert", to: authenticatedRole, withCheck: rls.isStaff }),
  pgPolicy(`${name}_staff_update`, { for: "update", to: authenticatedRole, using: rls.isStaff, withCheck: rls.isStaff }),
  pgPolicy(`${name}_admin_delete`, { for: "delete", to: authenticatedRole, using: rls.isAdmin }),
];

/** A partner organisation. Carries over between editions. */
export const organisations = app.table(
  "organisations",
  {
    id: id(),
    type: partnerType("type").notNull(),
    name: text("name").notNull(),
    /** type + normalised name: lets re-imports update instead of duplicating. */
    importKey: text("import_key").notNull().unique(),
    location: text("location"),
    website: text("website"),
    fitReason: text("fit_reason"),
    suggestedApproach: text("suggested_approach"),
    sourceUrl: text("source_url"),
    verificationNote: text("verification_note"),
    needsVerification: boolean("needs_verification").notNull().default(false),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    doNotContactReason: text("do_not_contact_reason"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("organisations_type").on(t.type), ...staffCrud("organisations")],
);

export const contacts = app.table(
  "contacts",
  {
    id: id(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    roleTitle: text("role_title"),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    channel: contactChannel("channel").notNull().default("email"),
    isPrimary: boolean("is_primary").notNull().default(false),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("contacts_org").on(t.organisationId), index("contacts_email").on(t.email), ...staffCrud("contacts")],
);

export type NodalOfficer = { name?: string; role?: string; phone?: string; email?: string };

/** An organisation in one edition's pipeline. */
export const partnerships = app.table(
  "partnerships",
  {
    id: id(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    stage: partnerStage("stage").notNull().default("not_contacted"),
    temperature: temperature("temperature").notNull().default("cold"),
    ownerEmail: text("owner_email"),
    primaryContactId: uuid("primary_contact_id").references(() => contacts.id, { onDelete: "set null" }),
    nextActionAt: date("next_action_at"),
    /** Required one-line personal reason, reused across the sequence. */
    personalLine: text("personal_line"),
    verificationAcknowledgedAt: timestamp("verification_acknowledged_at", { withTimezone: true }),
    pastPartner: boolean("past_partner").notNull().default(false),
    nodalOfficer: jsonb("nodal_officer").$type<NodalOfficer>().notNull().default({}),
    dayPlan: text("day_plan"),
    thankYouPhotosUrl: text("thank_you_photos_url"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("partnerships_edition_org").on(t.editionId, t.organisationId),
    index("partnerships_owner").on(t.ownerEmail),
    index("partnerships_stage").on(t.editionId, t.stage),
    ...staffCrud("partnerships"),
  ],
);

export const templateStep = app.enum("template_step", ["first", "fu1", "fu2", "thank_you"]);
export type TemplateStep = (typeof templateStep.enumValues)[number];

export const emailTemplates = app.table(
  "email_templates",
  {
    id: id(),
    partnerType: partnerType("partner_type").notNull(),
    step: templateStep("step").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (t) => [uniqueIndex("email_templates_type_step").on(t.partnerType, t.step), ...staffCrud("email_templates")],
);

export const sequenceStepKind = app.enum("sequence_step_kind", ["first", "fu1", "fu2", "call"]);
export type SequenceStepKind = (typeof sequenceStepKind.enumValues)[number];
export const sequenceStepStatus = app.enum("sequence_step_status", ["pending", "queued", "sent", "done", "skipped", "stopped"]);

export const sequenceSteps = app.table(
  "sequence_steps",
  {
    id: id(),
    partnershipId: uuid("partnership_id")
      .notNull()
      .references(() => partnerships.id, { onDelete: "cascade" }),
    step: sequenceStepKind("step").notNull(),
    dueAt: date("due_at").notNull(),
    status: sequenceStepStatus("status").notNull().default("pending"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    /** Snapshot of exactly what was approved and sent. */
    subject: text("subject"),
    body: text("body"),
    approvedBy: text("approved_by"),
    outboundMessageId: uuid("outbound_message_id").references(() => outboundMessages.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sequence_steps_partnership_step").on(t.partnershipId, t.step),
    index("sequence_steps_due").on(t.status, t.dueAt),
    ...staffCrud("sequence_steps"),
  ],
);

export const gmailStatus = app.enum("gmail_status", ["active", "revoked", "error"]);

/** One per staff member. The refresh token is AES-256-GCM encrypted and never sent to a browser. */
export const gmailConnections = app.table(
  "gmail_connections",
  {
    staffEmail: text("staff_email").primaryKey(),
    googleEmail: text("google_email").notNull(),
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    scopes: text("scopes").notNull(),
    status: gmailStatus("status").notNull().default("active"),
    dailyCap: integer("daily_cap").notNull().default(30),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    // Staff see connection status (not tokens: queries select specific columns). Writes are privileged.
    pgPolicy("gmail_connections_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
    pgPolicy("gmail_connections_own_delete", {
      for: "delete",
      to: authenticatedRole,
      using: sql`${t.staffEmail} = app_private.current_email()`,
    }),
  ],
);

export const gmailThreads = app.table(
  "gmail_threads",
  {
    id: id(),
    partnershipId: uuid("partnership_id")
      .notNull()
      .references(() => partnerships.id, { onDelete: "cascade" }),
    senderEmail: text("sender_email").notNull(),
    gmailThreadId: text("gmail_thread_id").notNull(),
    /** RFC 5322 Message-ID of our last message, for In-Reply-To on follow-ups. */
    lastRfcMessageId: text("last_rfc_message_id"),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    replyDetectedAt: timestamp("reply_detected_at", { withTimezone: true }),
    replyKind: text("reply_kind"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("gmail_threads_partnership").on(t.partnershipId),
    index("gmail_threads_open").on(t.replyDetectedAt),
    pgPolicy("gmail_threads_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
  ],
);

export const activities = app.table(
  "activities",
  {
    id: id(),
    partnershipId: uuid("partnership_id")
      .notNull()
      .references(() => partnerships.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    body: text("body"),
    actorEmail: text("actor_email"),
    meta: jsonb("meta").notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activities_partnership").on(t.partnershipId, t.at),
    pgPolicy("activities_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
    pgPolicy("activities_staff_insert", { for: "insert", to: authenticatedRole, withCheck: rls.isStaff }),
  ],
);

export const taskStatus = app.enum("task_status", ["open", "done", "skipped"]);
export const taskKind = app.enum("task_kind", ["timeline", "outreach_call", "manual_contact", "bounce", "partner_request", "other"]);
export type ChecklistItem = { label: string; done: boolean };

export const tasks = app.table(
  "tasks",
  {
    id: id(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: taskKind("kind").notNull().default("other"),
    ownerEmail: text("owner_email"),
    dueAt: date("due_at"),
    /** Days relative to Day 1 for timeline tasks (negative = before). */
    offsetDays: integer("offset_days"),
    status: taskStatus("status").notNull().default("open"),
    partnershipId: uuid("partnership_id").references(() => partnerships.id, { onDelete: "cascade" }),
    checklist: jsonb("checklist").$type<ChecklistItem[]>().notNull().default([]),
    notes: text("notes"),
    /** Idempotency for generated tasks (e.g. "call:<partnershipId>"). */
    sourceKey: text("source_key"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("tasks_edition_due").on(t.editionId, t.status, t.dueAt),
    uniqueIndex("tasks_source_key").on(t.editionId, t.sourceKey),
    ...staffCrud("tasks"),
  ],
);

export type TemplateTask = { title: string; offsetDays: number; ownerEmail?: string | null };

export const taskTemplates = app.table(
  "task_templates",
  {
    id: id(),
    name: text("name").notNull(),
    tasks: jsonb("tasks").$type<TemplateTask[]>().notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdBy: text("created_by"),
    ...timestamps,
  },
  () => staffCrud("task_templates"),
);

export const partnerAccess = app.table(
  "partner_access",
  {
    id: id(),
    partnershipId: uuid("partnership_id")
      .notNull()
      .references(() => partnerships.id, { onDelete: "cascade" }),
    contactEmail: text("contact_email"),
    tokenHash: text("token_hash").notNull().unique(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  () => [pgPolicy("partner_access_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff })],
);

export const partnerRequests = app.table(
  "partner_requests",
  {
    id: id(),
    partnershipId: uuid("partnership_id")
      .notNull()
      .references(() => partnerships.id, { onDelete: "cascade" }),
    fromName: text("from_name"),
    message: text("message").notNull(),
    status: text("status").notNull().default("open"),
    ...timestamps,
  },
  () => staffCrud("partner_requests"),
);

export const imports = app.table(
  "imports",
  {
    id: id(),
    fileName: text("file_name").notNull(),
    summary: jsonb("summary").notNull().default({}),
    actorEmail: text("actor_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [pgPolicy("imports_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff })],
);

/** Tracked links (posters, share kits, referral QR codes). */
export const shortLinks = app.table(
  "short_links",
  {
    code: text("code").primaryKey(),
    targetUrl: text("target_url").notNull(),
    label: text("label"),
    partnershipId: uuid("partnership_id").references(() => partnerships.id, { onDelete: "cascade" }),
    editionId: uuid("edition_id").references(() => editions.id, { onDelete: "cascade" }),
    clicks: integer("clicks").notNull().default(0),
    ...timestamps,
  },
  () => [pgPolicy("short_links_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff })],
);
