import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { StaffRole } from "@/server/db/schema";
import type { JwtClaims } from "@/server/db/user";
import { getStaffMemberByEmail, type StaffMember } from "@/server/privileged/staff";
import { supabaseServer } from "./supabase";

export type SessionUser = { id: string; email: string; claims: JwtClaims };

/**
 * The verified user for this request, or null. getClaims() verifies the JWT (locally with
 * asymmetric keys, or via the Auth server otherwise), so the result is safe to authorise on.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const { sub, email } = data.claims;
  if (typeof sub !== "string" || typeof email !== "string" || !email) return null;
  return {
    id: sub,
    email: email.toLowerCase(),
    claims: { ...(data.claims as Record<string, unknown>), sub, email: email.toLowerCase() },
  };
});

export async function requireUser(loginPath: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(loginPath as never);
  return user;
}

export type StaffSession = SessionUser & { staff: StaffMember };

export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const staff = await getStaffMemberByEmail(user.email);
  if (!staff || !staff.active || staff.roles.length === 0) return null;
  return { ...user, staff };
});

export function hasRole(session: StaffSession, ...roles: StaffRole[]): boolean {
  return session.staff.roles.some((r) => roles.includes(r));
}

export const STAFF_ROLES: StaffRole[] = ["owner", "admin", "staff"];
export const ADMIN_ROLES: StaffRole[] = ["owner", "admin"];

/**
 * Gate for staff pages and actions. Redirects to /login when signed out and to /forbidden
 * when signed in without one of the required roles. Always re-checked server-side.
 */
export async function requireStaff(roles: StaffRole[] = STAFF_ROLES): Promise<StaffSession> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const session = await getStaffSession();
  if (!session || !hasRole(session, ...roles)) redirect("/forbidden");
  return session;
}
