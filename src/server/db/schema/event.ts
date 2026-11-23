import { boolean, index, integer, jsonb, pgPolicy, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";
import { app, id, rls, timestamps } from "./_shared";
import { applications } from "./applications";
import { editions } from "./editions";
import { ambassadors } from "./selection";

const staffAll = (name: string) => [
  pgPolicy(`${name}_staff_all`, { for: "all", to: authenticatedRole, using: rls.isStaff, withCheck: rls.isStaff }),
];

export const teams = app.table(
  "teams",
  {
    id: id(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    mentor: text("mentor"),
    isWinner: boolean("is_winner").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("teams_edition_number").on(t.editionId, t.number), ...staffAll("teams")],
);

export const teamMembers = app.table(
  "team_members",
  {
    id: id(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .unique()
      .references(() => applications.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  () => staffAll("team_members"),
);

export const runOfShow = app.table(
  "run_of_show",
  {
    id: id(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at"),
    title: text("title").notNull(),
    location: text("location"),
    ownerEmail: text("owner_email"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("run_of_show_edition_day").on(t.editionId, t.day, t.startsAt), ...staffAll("run_of_show")],
);

export const checkins = app.table(
  "checkins",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    byEmail: text("by_email").notNull(),
    /** Set by the scanner so an offline scan synced twice is recorded once. */
    clientId: text("client_id"),
  },
  (t) => [uniqueIndex("checkins_app_day").on(t.applicationId, t.day), ...staffAll("checkins")],
);

export const emergencyContacts = app.table(
  "emergency_contacts",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .unique()
      .references(() => applications.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relation: text("relation").notNull(),
    phone: text("phone").notNull(),
    medicalNotes: text("medical_notes"),
    ...timestamps,
  },
  () => [pgPolicy("emergency_contacts_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff })],
);

export type FeedbackAnswers = { liked?: string; improve?: string };

export const feedbackResponses = app.table(
  "feedback_responses",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    rating: integer("rating").notNull(),
    answers: jsonb("answers").$type<FeedbackAnswers>().notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("feedback_app_day").on(t.applicationId, t.day),
    pgPolicy("feedback_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
  ],
);

export const certificateKind = app.enum("certificate_kind", ["participation", "winner", "ambassador"]);

export const certificates = app.table(
  "certificates",
  {
    id: id(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "cascade" }),
    ambassadorId: uuid("ambassador_id").references(() => ambassadors.id, { onDelete: "cascade" }),
    kind: certificateKind("kind").notNull(),
    /** Public verification code printed on the certificate. */
    code: text("code").notNull().unique(),
    recipientName: text("recipient_name").notNull(),
    college: text("college"),
    detail: text("detail"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("certificates_app_kind").on(t.applicationId, t.kind),
    uniqueIndex("certificates_ambassador_kind").on(t.ambassadorId, t.kind),
    pgPolicy("certificates_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
  ],
);

export const submissions = app.table(
  "submissions",
  {
    id: id(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    abstract: text("abstract"),
    filePath: text("file_path").notNull(),
    fileName: text("file_name").notNull(),
    submittedBy: uuid("submitted_by").references(() => applications.id, { onDelete: "set null" }),
    status: text("status").notNull().default("received"),
    ...timestamps,
  },
  (t) => [index("submissions_team").on(t.teamId), pgPolicy("submissions_staff_all", { for: "all", to: authenticatedRole, using: rls.isStaff, withCheck: rls.isStaff })],
);
