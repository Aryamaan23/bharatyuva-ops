import Link from "next/link";
import { BarList, PageHeader, Stat, timeAgo } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { applicationStats } from "@/server/applications/staff";
import { redirect } from "next/navigation";
import { getStaffSession, hasRole, requireStaff, STAFF_ROLES } from "@/server/auth/session";
import { daysUntil, formatDate } from "@/server/domain/editions";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { latestJobRuns } from "@/server/platform/health";
import { outreachSnapshot } from "@/server/outreach/dashboard";
import { overdueTasks } from "@/server/tasks/queries";
import { leaderboard } from "@/server/privileged/ambassadors";
import { STAGE_LABELS } from "@/components/outreach/labels";

export const metadata = { title: "Dashboard" };

const FUNNEL = ["draft", "submitted", "under_review", "shortlisted", "selected", "confirmed", "attended"] as const;

export default async function DashboardPage() {
  const reviewerOnly = await getStaffSession();
  if (reviewerOnly && !hasRole(reviewerOnly, ...STAFF_ROLES) && hasRole(reviewerOnly, "reviewer")) redirect("/admin/reviews");
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card>
          <CardContent className="py-6">
            No edition is marked current. <Link href="/admin/editions" className="underline">Create or select an edition</Link>.
          </CardContent>
        </Card>
      </>
    );
  }
  const [stats, jobs, outreach, overdue] = await Promise.all([
    applicationStats(session, edition.id),
    latestJobRuns(session),
    outreachSnapshot(session, edition.id),
    overdueTasks(session, edition.id),
  ]);
  const ambassadors = (await leaderboard(edition.id)).filter((a) => a.status === "approved").slice(0, 5);
  const statusCount = (s: string) => stats.byStatus.find((r) => r.status === s)?.n ?? 0;
  const submitted = stats.byStatus.filter((r) => r.status !== "draft").reduce((a, r) => a + r.n, 0);
  const d1 = edition.day1Date ? daysUntil(edition.day1Date, new Date()) : null;
  const days = [
    { label: "Day 1 · Learn", type: "university", venue: edition.venues.day1, date: edition.day1Date },
    { label: "Day 2 · Immerse", type: "district", venue: edition.venues.day2, date: edition.day2Date },
    { label: "Day 3 · Present", type: "embassy", venue: edition.venues.day3, date: edition.day3Date },
  ] as const;

  return (
    <>
      <PageHeader title={edition.name} description={`Status: ${edition.status}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Days until Day 1" value={d1 === null ? "—" : d1} hint={edition.day1Date ? formatDate(edition.day1Date) : "Set dates in edition settings"} />
        <Stat label="Submitted applications" value={submitted} />
        <Stat label="Drafts in progress" value={statusCount("draft")} hint="Get reminders 48 h and 24 h before the deadline" />
        <Stat label="Seats confirmed" value={statusCount("confirmed")} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {days.map((d) => (
          <Card key={d.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{d.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {(() => {
                const partner = outreach.confirmed.find((c) => c.type === d.type);
                const talking = outreach.discussing.find((c) => c.type === d.type)?.n ?? 0;
                return partner ? (
                  <Badge className="bg-green-700">Confirmed: {partner.name}</Badge>
                ) : (
                  <>
                    <Badge variant="outline" className="border-destructive text-destructive">
                      No partner confirmed
                    </Badge>
                    {talking > 0 && <p className="text-muted-foreground">{talking} in discussion</p>}
                  </>
                );
              })()}
              {d.venue && <p className="text-muted-foreground">Venue: {d.venue.name}</p>}
              <p className="text-muted-foreground">{d.date ? formatDate(d.date) : "Date not set"}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={FUNNEL.map((s) => ({ label: s.replace("_", " "), value: statusCount(s) }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where applicants came from</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={stats.bySource.slice(0, 8).map((r) => ({ label: r.source, value: r.n }))} empty="No submitted applications yet" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">States</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={stats.byState.slice(0, 8).map((r) => ({ label: r.state, value: r.n }))} empty="No submitted applications yet" />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ambassador leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={ambassadors.map((a) => ({ label: `${a.fullName} · ${a.college}`, value: a.submitted }))} empty="No approved ambassadors yet." />
            <Link href="/admin/ambassadors" className="mt-3 inline-block text-sm underline">
              All ambassadors
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last automation runs</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs have run yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {jobs.map((j) => (
                  <li key={j.id} className="flex justify-between gap-2">
                    <span>{j.job}</span>
                    <span className={j.status === "failed" ? "font-semibold text-destructive" : "text-muted-foreground"}>
                      {j.status} · {timeAgo(j.startedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/health" className="mt-3 inline-block text-sm underline">
              Health details
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              <Link href="/admin/outreach/queue" className="font-semibold underline">
                {outreach.queueMine} outreach email{outreach.queueMine === 1 ? "" : "s"} in your queue
              </Link>{" "}
              <span className="text-muted-foreground">({outreach.queueAll} across the team)</span>
            </p>
            <div>
              <p className="font-semibold">Overdue or due today</p>
              {overdue.length === 0 ? (
                <p className="text-muted-foreground">Nothing overdue.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {overdue.map((t) => (
                    <li key={t.id} className="flex justify-between gap-2">
                      <span>{t.title}</span>
                      <span className="text-muted-foreground">{t.dueAt}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/admin/tasks?filter=overdue" className="text-xs underline">
                All tasks
              </Link>
            </div>
            <div>
              <p className="font-semibold">Partner pipeline</p>
              <p className="text-muted-foreground">
                {outreach.byStage
                  .filter((r) => r.n > 0)
                  .map((r) => `${STAGE_LABELS[r.stage]} ${r.n}`)
                  .join(" · ") || "No partners yet. Import the spreadsheet."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
