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
import type { FormDefinition, LocalizedText } from "@/lib/forms/definition";
import { app, id, rls, timestamps } from "./_shared";

export const editionStatus = app.enum("edition_status", [
  "draft",
  "outreach",
  "applications",
  "selection",
  "event",
  "closed",
]);

export type Venue = { name: string; city: string; partnerName?: string };
export type EditionVenues = { day1?: Venue; day2?: Venue; day3?: Venue };
export type PosterUrls = { university?: string; district?: string; embassy?: string; general?: string };
export type PostSelectionDocument = { key: string; label: LocalizedText; required: boolean };

export const editions = app.table(
  "editions",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    status: editionStatus("status").notNull().default("draft"),
    isCurrent: boolean("is_current").notNull().default(false),
    day1Date: date("day1_date"),
    day2Date: date("day2_date"),
    day3Date: date("day3_date"),
    venues: jsonb("venues").$type<EditionVenues>().notNull().default({}),
    applicationsOpenAt: timestamp("applications_open_at", { withTimezone: true }),
    applicationsCloseAt: timestamp("applications_close_at", { withTimezone: true }),
    seatConfirmHours: integer("seat_confirm_hours").notNull().default(72),
    /** Fellows to select; the waitlist fills seats up to this number. */
    seats: integer("seats").notNull().default(50),
    retentionMonths: integer("retention_months").notNull().default(12),
    minAge: integer("min_age").notNull().default(18),
    posterUrls: jsonb("poster_urls").$type<PosterUrls>().notNull().default({}),
    postSelectionDocuments: jsonb("post_selection_documents").$type<PostSelectionDocument[]>().notNull().default([]),
    contactEmail: text("contact_email"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("editions_one_current").on(t.isCurrent).where(sql`${t.isCurrent}`),
    // Public pages read edition details through the privileged layer; staff read/write here.
    pgPolicy("editions_select_authenticated", { for: "select", to: authenticatedRole, using: sql`true` }),
    pgPolicy("editions_write_admin", { for: "all", to: authenticatedRole, using: rls.isAdmin, withCheck: rls.isAdmin }),
  ],
);

export const formDefinitions = app.table(
  "form_definitions",
  {
    id: id(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definition: jsonb("definition").$type<FormDefinition>().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: text("created_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("form_definitions_edition_version").on(t.editionId, t.version),
    pgPolicy("form_definitions_select_authenticated", { for: "select", to: authenticatedRole, using: sql`true` }),
    pgPolicy("form_definitions_write_admin", {
      for: "all",
      to: authenticatedRole,
      using: rls.isAdmin,
      withCheck: rls.isAdmin,
    }),
  ],
);

export const consentKind = app.enum("consent_kind", ["processing", "whatsapp", "guardian"]);

export const consentVersions = app.table(
  "consent_versions",
  {
    id: id(),
    kind: consentKind("kind").notNull(),
    version: integer("version").notNull(),
    textEn: text("text_en").notNull(),
    textHi: text("text_hi").notNull().default(""),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("consent_versions_kind_version").on(t.kind, t.version),
    index("consent_versions_kind_published").on(t.kind, t.publishedAt),
    pgPolicy("consent_versions_select_authenticated", { for: "select", to: authenticatedRole, using: sql`true` }),
    pgPolicy("consent_versions_write_admin", {
      for: "all",
      to: authenticatedRole,
      using: rls.isAdmin,
      withCheck: rls.isAdmin,
    }),
  ],
);
