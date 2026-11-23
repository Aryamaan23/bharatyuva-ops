import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { listApplications } from "@/server/applications/staff";
import { ADMIN_ROLES, getStaffSession, hasRole } from "@/server/auth/session";
import { audit } from "@/server/privileged/audit";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Admin-only CSV export of the application list (contact details included). Every export is logged. */
export async function GET(request: NextRequest) {
  const session = await getStaffSession();
  if (!session || !hasRole(session, ...ADMIN_ROLES)) return new NextResponse("Forbidden", { status: 403 });
  const editionId = z.uuid().safeParse(request.nextUrl.searchParams.get("edition"));
  if (!editionId.success) return new NextResponse("edition required", { status: 400 });

  const header = ["id", "status", "submitted_at", "name", "email", "state", "college", "source", "referral_code", "duplicate_of"];
  const lines = [header.map(csvCell).join(",")];
  let page = 1;
  let total = 0;
  for (;;) {
    const res = await listApplications(session, { editionId: editionId.data, page });
    total = res.total;
    for (const r of res.rows) {
      lines.push(
        [r.id, r.status, r.submittedAt, r.name, r.email, r.state, r.college, r.source, r.referralCode, r.duplicateOf].map(csvCell).join(","),
      );
    }
    if (page * res.pageSize >= res.total) break;
    page += 1;
  }
  await audit({ actorEmail: session.email, action: "export.applications_csv", entity: "edition", entityId: editionId.data, after: { rows: total } });
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
