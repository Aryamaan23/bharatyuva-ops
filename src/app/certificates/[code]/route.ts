import { NextResponse } from "next/server";
import { certificatePdf } from "@/server/privileged/event";

/** Public certificate download by its verification code (name and college only). */
export async function GET(_req: Request, ctx: RouteContext<"/certificates/[code]">) {
  const { code } = await ctx.params;
  const clean = code.replace(/\.pdf$/i, "").toUpperCase();
  const pdf = await certificatePdf(clean);
  if (!pdf) return new NextResponse("Certificate not found", { status: 404 });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Bharat-Yuva-certificate-${clean}.pdf"`, "Cache-Control": "private, max-age=300" },
  });
}
