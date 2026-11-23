import { NextResponse } from "next/server";
import { ADMIN_ROLES, getStaffSession, hasRole } from "@/server/auth/session";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { impactPdf } from "@/server/event/impact-export";
import { audit } from "@/server/privileged/audit";

export async function GET() {
  const session = await getStaffSession();
  if (!session || !hasRole(session, ...ADMIN_ROLES)) return new NextResponse("Forbidden", { status: 403 });
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return new NextResponse("No current edition", { status: 404 });
  const pdf = await impactPdf(session, edition);
  await audit({ actorEmail: session.email, action: "export.impact_pdf", entity: "edition", entityId: edition.id });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${edition.slug}-impact.pdf"`, "Cache-Control": "no-store" } });
}
