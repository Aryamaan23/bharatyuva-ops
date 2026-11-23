import Link from "next/link";
import { BarList, PageHeader, Stat } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ADMIN_ROLES, hasRole, requireStaff } from "@/server/auth/session";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { impactReport } from "@/server/event/queries";

export const metadata = { title: "Impact report" };

export default async function ImpactPage() {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Impact report" />;
  const r = await impactReport(session, edition.id);
  const isAdmin = hasRole(session, ...ADMIN_ROLES);
  return (
    <>
      <PageHeader
        title={`Impact: ${edition.name}`}
        actions={
          <div className="flex gap-2">
            <Link href="/admin/event" className="self-center text-sm underline">
              Event & after
            </Link>
            {isAdmin && (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href="/admin/event/impact/pdf" target="_blank" rel="noopener">
                    PDF
                  </a>
                </Button>
                <form action="/admin/event/impact/csv" method="get">
                  <Button type="submit" variant="outline" size="sm">
                    CSV (logged)
                  </Button>
                </form>
              </>
            )}
          </div>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Submitted" value={r.totals.submitted} />
        <Stat label="States" value={r.totals.states} />
        <Stat label="Started" value={r.totals.started} />
        <Stat label="Seats offered" value={r.totals.selected} />
        <Stat label="Confirmed" value={r.totals.confirmed} />
        <Stat label="Attended" value={r.totals.attended} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={r.bySource.map((x) => ({ label: x.label, value: x.n }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">States</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={r.byState.slice(0, 15).map((x) => ({ label: x.label, value: x.n }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance and feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <BarList rows={r.attendanceByDay.map((a) => ({ label: `Day ${a.day}`, value: a.n }))} empty="No check-ins yet." />
            {r.feedback.map((f) => (
              <p key={f.day}>
                Day {f.day} feedback: {f.avg ?? "—"}/5 ({f.n})
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Partners</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm">
              {r.partners.map((p) => (
                <li key={p.name}>
                  {p.name} <span className="text-muted-foreground">({p.type})</span>
                </li>
              ))}
              {r.partners.length === 0 && <li className="text-muted-foreground">None confirmed.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
