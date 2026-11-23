import { NextResponse } from "next/server";
import { z } from "zod";
import { getStaffSession } from "@/server/auth/session";
import { audit } from "@/server/privileged/audit";
import { districtLetterPdf } from "@/server/privileged/letters";

export async function GET(_req: Request, ctx: RouteContext<"/admin/outreach/[id]/letter">) {
  const session = await getStaffSession();
  if (!session) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const letter = await districtLetterPdf(id);
  if (!letter) return new NextResponse("Not found", { status: 404 });
  await audit({ actorEmail: session.email, action: "letter.generated", entity: "partnership", entityId: id });
  return new NextResponse(new Uint8Array(letter.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${letter.filename}"`, "Cache-Control": "no-store" },
  });
}
