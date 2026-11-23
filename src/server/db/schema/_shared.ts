import { sql } from "drizzle-orm";
import { pgSchema, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * All application tables live in the `app` schema, which is NOT exposed through Supabase's
 * auto-generated Data API (only `public` and `graphql_public` are). Users therefore can't reach
 * these tables with their JWT directly; every read/write goes through our server, where RLS is
 * enforced again via withUserDb(). See docs/PLAN.md §0.
 */
export const app = pgSchema("app");

export const id = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** SQL helpers implemented in drizzle/0000_app_functions.sql (schema app_private) (SECURITY DEFINER, fixed search_path). */
export const rls = {
  isStaff: sql`app_private.is_staff()`,
  isAdmin: sql`app_private.is_admin()`,
  isOwner: sql`app_private.has_role('owner')`,
  currentApplicantId: sql`app_private.current_applicant_id()`,
  uid: sql`(select auth.uid())`,
};
