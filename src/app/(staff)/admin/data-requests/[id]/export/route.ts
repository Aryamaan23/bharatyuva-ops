import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_ROLES, getStaffSession, hasRole } from "@/server/auth/session";
import { audit } from "@/server/privileged/audit";
import { exportApplicantData } from "@/server/privileged/data-requests";

export async function GET(_req: Request, ctx: RouteContext<"/admin/data-requests/[id]/export">) {
  const session = await getStaffSession();
  if (!session || !hasRole(session, ...ADMIN_ROLES)) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const data = await exportApplicantData(id);
  if (!data) return new NextResponse("Not found", { status: 404 });
  await audit({ actorEmail: session.email, action: "export.data_request", entity: "deletion_request", entityId: id });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="data-request-${id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
