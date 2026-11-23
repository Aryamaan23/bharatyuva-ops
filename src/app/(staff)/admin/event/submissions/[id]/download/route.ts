import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getStaffSession, hasRole, STAFF_ROLES } from "@/server/auth/session";
import { submissions } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { signedDocumentUrl } from "@/server/privileged/event";

/** Short-lived signed link to a team's uploaded PDF (staff only). */
export async function GET(_req: Request, ctx: RouteContext<"/admin/event/submissions/[id]/download">) {
  const session = await getStaffSession();
  if (!session || !hasRole(session, ...STAFF_ROLES)) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const [sub] = await withUserDb(session.claims, (tx) => tx.select().from(submissions).where(eq(submissions.id, id)).limit(1));
  const url = sub ? await signedDocumentUrl(sub.filePath) : null;
  return url ? NextResponse.redirect(url) : new NextResponse("Not found", { status: 404 });
}
