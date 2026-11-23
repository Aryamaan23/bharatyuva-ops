import { sql } from "drizzle-orm";
import { bigserial, index, integer, jsonb, pgPolicy, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { app, id, rls, timestamps } from "./_shared";

export const messageChannel = app.enum("message_channel", ["email", "gmail", "whatsapp"]);
export const messageStatus = app.enum("message_status", [
  "pending",
  "sending",
  "sent",
  "redirected",
  "logged",
  "failed",
  "cancelled",
]);
export type MessageStatus = (typeof messageStatus.enumValues)[number];

/**
 * Every outgoing message is written here first. `idempotency_key` is unique, so re-running a job
 * can never send the same message twice. A drainer sends due rows with retries and backoff.
 */
export const outboundMessages = app.table(
  "outbound_messages",
  {
    id: id(),
    channel: messageChannel("channel").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    toAddress: text("to_address").notNull(),
    subject: text("subject"),
    bodyHtml: text("body_html"),
    bodyText: text("body_text").notNull(),
    template: text("template").notNull(),
    /** Staff user (email) a Gmail message is sent as. */
    senderEmail: text("sender_email"),
    relatedEntity: text("related_entity"),
    relatedId: uuid("related_id"),
    notBefore: timestamp("not_before", { withTimezone: true }).notNull().defaultNow(),
    status: messageStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    providerId: text("provider_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Where it actually went (differs from to_address in redirect mode). */
    deliveredTo: text("delivered_to"),
    /** Channel-specific context, e.g. { partnershipId, step } for outreach. */
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    /** Generated at send time, e.g. [{ kind: "district_letter", partnershipId }]. */
    attachments: jsonb("attachments").$type<{ kind: string; partnershipId?: string }[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    index("outbound_messages_due").on(t.status, t.notBefore),
    index("outbound_messages_related").on(t.relatedEntity, t.relatedId),
    pgPolicy("outbound_messages_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
  ],
);

export const messageEvents = app.table(
  "message_events",
  {
    id: id(),
    outboundMessageId: uuid("outbound_message_id").references(() => outboundMessages.id, { onDelete: "cascade" }),
    providerId: text("provider_id"),
    kind: text("kind").notNull(),
    raw: jsonb("raw").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("message_events_message").on(t.outboundMessageId),
    // Webhook retries deliver the same event again; it is recorded once.
    uniqueIndex("message_events_provider_kind").on(t.providerId, t.kind),
    pgPolicy("message_events_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
  ],
);

export const jobStatus = app.enum("job_status", ["running", "succeeded", "failed"]);

export const jobRuns = app.table(
  "job_runs",
  {
    id: id(),
    job: text("job").notNull(),
    trigger: text("trigger").notNull(),
    status: jobStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    itemsProcessed: integer("items_processed").notNull().default(0),
    detail: jsonb("detail").notNull().default({}),
    error: text("error"),
  },
  (t) => [
    index("job_runs_job_started").on(t.job, t.startedAt),
    pgPolicy("job_runs_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
  ],
);

/** Insert-only (a trigger rejects UPDATE/DELETE for every role). */
export const auditLog = app.table(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ipHash: text("ip_hash"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity").on(t.entity, t.entityId),
    index("audit_log_at").on(t.at),
    pgPolicy("audit_log_admin_select", { for: "select", to: authenticatedRole, using: rls.isAdmin }),
    pgPolicy("audit_log_insert_self", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.actorEmail} = app_private.current_email()`,
    }),
  ],
);

/** Fixed-window counters used by app.rate_limit(). Only reachable through that function. */
export const rateLimits = app.table(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  () => [],
).enableRLS();

export const appSettings = app.table(
  "app_settings",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
    ...timestamps,
  },
  () => [
    pgPolicy("app_settings_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
    pgPolicy("app_settings_admin_write", { for: "all", to: authenticatedRole, using: rls.isAdmin, withCheck: rls.isAdmin }),
  ],
);

/** Every AI draft or summary, kept for audit. A person approves anything that is sent or decided. */
export const aiGenerations = app.table(
  "ai_generations",
  {
    id: id(),
    purpose: text("purpose").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    model: text("model").notNull(),
    promptHash: text("prompt_hash").notNull(),
    output: text("output").notNull(),
    createdBy: text("created_by"),
    ...timestamps,
  },
  (t) => [
    index("ai_generations_entity").on(t.entity, t.entityId),
    pgPolicy("ai_generations_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
  ],
);
