import { NextResponse } from "next/server";
import { ADMIN_ROLES, getStaffSession, hasRole } from "@/server/auth/session";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { impactCsv } from "@/server/event/impact-export";
import { audit } from "@/server/privileged/audit";

export async function GET() {
  const session = await getStaffSession();
  if (!session || !hasRole(session, ...ADMIN_ROLES)) return new NextResponse("Forbidden", { status: 403 });
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return new NextResponse("No current edition", { status: 404 });
  const csv = await impactCsv(session, edition);
  await audit({ actorEmail: session.email, action: "export.impact_csv", entity: "edition", entityId: edition.id });
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${edition.slug}-impact.csv"`, "Cache-Control": "no-store" } });
}
