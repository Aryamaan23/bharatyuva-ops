"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES, hasRole, requireStaff } from "@/server/auth/session";
import { staffMembers, staffRole, type StaffRole } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { audit } from "@/server/privileged/audit";

export type TeamFormState = { ok?: boolean; error?: string };

const memberSchema = z.object({
  email: z.email().transform((e) => e.trim().toLowerCase()),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  active: z.enum(["on"]).optional(),
});

/** Add or update a staff member. Only owners may grant or remove the owner role. */
export async function saveStaffMember(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const session = await requireStaff(ADMIN_ROLES);
  const parsed = memberSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    phone: formData.get("phone") || undefined,
    active: formData.get("active") || undefined,
  });
  if (!parsed.success) return { error: "Enter a valid email and name." };
  const roles = formData
    .getAll("roles")
    .map(String)
    .filter((r): r is StaffRole => (staffRole.enumValues as readonly string[]).includes(r));

  const isOwner = hasRole(session, "owner");
  const existing = await withUserDb(session.claims, async (tx) => {
    const [row] = await tx.select().from(staffMembers).where(eq(staffMembers.email, parsed.data.email)).limit(1);
    return row ?? null;
  });
  const hadOwner = existing?.roles.includes("owner") ?? false;
  const wantsOwner = roles.includes("owner");
  if (hadOwner !== wantsOwner && !isOwner) return { error: "Only an owner can grant or remove the owner role." };
  if (parsed.data.email === session.email && hadOwner && (!wantsOwner || !parsed.data.active)) {
    return { error: "You can't remove your own owner role or deactivate yourself." };
  }

  const values = {
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    phone: parsed.data.phone ?? null,
    roles,
    active: Boolean(parsed.data.active),
  };
  await withUserDb(session.claims, (tx) =>
    tx.insert(staffMembers).values(values).onConflictDoUpdate({ target: staffMembers.email, set: values }),
  );
  await audit({
    actorEmail: session.email,
    action: existing ? "staff.updated" : "staff.added",
    entity: "staff_member",
    entityId: values.email,
    before: existing ? { roles: existing.roles, active: existing.active } : null,
    after: { roles: values.roles, active: values.active },
  });
  revalidatePath("/admin/team");
  return { ok: true };
}
