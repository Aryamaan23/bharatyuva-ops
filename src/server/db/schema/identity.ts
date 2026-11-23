import { sql } from "drizzle-orm";
import { boolean, pgPolicy, text, uuid } from "drizzle-orm/pg-core";
import { authenticatedRole, authUsers } from "drizzle-orm/supabase";
import { app, rls, timestamps } from "./_shared";

export const staffRole = app.enum("staff_role", ["owner", "admin", "staff", "reviewer"]);
export type StaffRole = (typeof staffRole.enumValues)[number];

/**
 * Staff are keyed by (verified) email so an owner can grant a role before the person has ever
 * signed in. app.has_role() compares against the email claim in the Supabase JWT.
 */
export const staffMembers = app.table(
  "staff_members",
  {
    email: text("email").primaryKey(),
    fullName: text("full_name").notNull(),
    roles: staffRole("roles").array().notNull().default(sql`'{}'::app.staff_role[]`),
    active: boolean("active").notNull().default(true),
    phone: text("phone"),
    signature: text("signature"),
    ...timestamps,
  },
  () => [
    pgPolicy("staff_members_select_staff", {
      for: "select",
      to: authenticatedRole,
      using: sql`${rls.isStaff} or email = app_private.current_email()`,
    }),
    pgPolicy("staff_members_write_admin", {
      for: "all",
      to: authenticatedRole,
      using: rls.isAdmin,
      withCheck: rls.isAdmin,
    }),
  ],
);

export const profiles = app.table(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    fullName: text("full_name"),
    locale: text("locale").notNull().default("en"),
    ...timestamps,
  },
  (t) => [
    pgPolicy("profiles_own", {
      for: "all",
      to: authenticatedRole,
      using: sql`${t.userId} = ${rls.uid}`,
      withCheck: sql`${t.userId} = ${rls.uid}`,
    }),
    pgPolicy("profiles_staff_select", { for: "select", to: authenticatedRole, using: rls.isStaff }),
  ],
);
