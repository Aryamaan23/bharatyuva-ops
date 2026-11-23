import "server-only";
import { eq, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { adminDb } from "@/server/db/admin";
import { staffMembers, type StaffRole } from "@/server/db/schema";
import { audit } from "./audit";

export type StaffMember = {
  email: string;
  fullName: string;
  roles: StaffRole[];
  active: boolean;
};

export async function getStaffMemberByEmail(email: string): Promise<StaffMember | null> {
  const [row] = await adminDb()
    .select({
      email: staffMembers.email,
      fullName: staffMembers.fullName,
      roles: staffMembers.roles,
      active: staffMembers.active,
    })
    .from(staffMembers)
    .where(eq(staffMembers.email, email.toLowerCase()))
    .limit(1);
  return row ?? null;
}

/**
 * Emails listed in OWNER_EMAILS become owners the first time they sign in. This is the only
 * bootstrap path; every other role is granted by an owner/admin in /admin/team.
 */
export async function ensureOwnerBootstrap(email: string, fullName: string | null): Promise<void> {
  const normalized = email.toLowerCase();
  if (!env().OWNER_EMAILS.includes(normalized)) return;
  const inserted = await adminDb()
    .insert(staffMembers)
    .values({ email: normalized, fullName: fullName ?? normalized, roles: ["owner"] })
    .onConflictDoUpdate({
      target: staffMembers.email,
      set: { roles: sql`array(select distinct unnest(${staffMembers.roles} || '{owner}'::app.staff_role[]))` },
      where: sql`not ('owner' = any(${staffMembers.roles}))`,
    })
    .returning({ email: staffMembers.email });
  if (inserted.length > 0) {
    await audit({ actorEmail: "system", action: "staff.owner_bootstrap", entity: "staff_member", entityId: normalized });
  }
}
