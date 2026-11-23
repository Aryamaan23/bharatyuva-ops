import { NextResponse, type NextRequest } from "next/server";
import { getStaffSession, hasRole, STAFF_ROLES } from "@/server/auth/session";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { audit } from "@/server/privileged/audit";
import { compendiumPdf } from "@/server/privileged/event";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const session = await getStaffSession();
  if (!session || !hasRole(session, ...STAFF_ROLES)) return new NextResponse("Forbidden", { status: 403 });
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return new NextResponse("No current edition", { status: 404 });
  const title = (request.nextUrl.searchParams.get("title") ?? `${edition.name}: Policy Compendium`).slice(0, 150);
  const intro = (request.nextUrl.searchParams.get("intro") ?? "").slice(0, 2000);
  const pdf = await compendiumPdf(edition.id, title, intro);
  if (!pdf) return new NextResponse("Not found", { status: 404 });
  await audit({ actorEmail: session.email, action: "compendium.generated", entity: "edition", entityId: edition.id });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${edition.slug}-compendium.pdf"`, "Cache-Control": "no-store" } });
}
