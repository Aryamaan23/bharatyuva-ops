import Link from "next/link";
import { BarList, PageHeader, Stat } from "@/components/admin/ui";
import { ScoreTable } from "@/components/selection/score-table";
import { SelectionRunButtons } from "@/components/selection/run-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ADMIN_ROLES, hasRole, requireStaff } from "@/server/auth/session";
import { applicationStatus, type ApplicationStatus } from "@/server/db/schema";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { diversity, recentBatches, reviewerWorkload, scoreboard } from "@/server/selection/queries";

export const metadata = { title: "Selection" };

export default async function SelectionPage({ searchParams }: PageProps<"/admin/selection">) {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Selection" description="No current edition." />;
  const sp = await searchParams;
  const status = applicationStatus.enumValues.find((s) => s === sp.status) as ApplicationStatus | undefined;
  const [rows, all, workload, batches] = await Promise.all([
    scoreboard(session, edition.id, status),
    scoreboard(session, edition.id),
    reviewerWorkload(session, edition.id),
    recentBatches(session, edition.id),
  ]);
  const cohort = diversity(all, ["shortlisted", "interview", "selected", "confirmed"]);
  const count = (s: ApplicationStatus) => all.filter((r) => r.status === s).length;
  const isAdmin = hasRole(session, ...ADMIN_ROLES);

  return (
    <>
      <PageHeader
        title="Selection"
        description={`${edition.name} · ${edition.seats} seats · offers expire after ${edition.seatConfirmHours} h, then the waitlist is offered automatically.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/selection/rubric">Rubric</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/selection/interviews">Interview slots</Link>
            </Button>
          </div>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="To review" value={count("submitted") + count("under_review")} />
        <Stat label="Shortlisted" value={count("shortlisted")} />
        <Stat label="Interview" value={count("interview")} />
        <Stat label="Offers out" value={count("selected")} />
        <Stat label="Confirmed" value={`${count("confirmed")}/${edition.seats}`} />
        <Stat label="Waitlist" value={count("waitlisted")} />
      </div>
      {isAdmin && (
        <div className="mb-4">
          <SelectionRunButtons />
        </div>
      )}
      <nav aria-label="Filter by status" className="mb-3 flex flex-wrap gap-1 text-sm">
        <Link href="/admin/selection" className={`rounded px-2 py-1 ${!status ? "bg-brand-navy text-white" : "hover:bg-secondary"}`}>
          All
        </Link>
        {(["under_review", "shortlisted", "interview", "selected", "confirmed", "waitlisted", "rejected", "declined"] as const).map((s) => (
          <Link key={s} href={`/admin/selection?status=${s}`} className={`rounded px-2 py-1 ${status === s ? "bg-brand-navy text-white" : "hover:bg-secondary"}`}>
            {s.replace("_", " ")} ({count(s)})
          </Link>
        ))}
      </nav>
      <ScoreTable rows={rows} canDecide={isAdmin} />

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cohort by state ({cohort.total})</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={cohort.state.slice(0, 10)} empty="Shortlist or select people to see the cohort mix." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cohort by discipline and gender</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BarList rows={cohort.discipline} empty="—" />
            <BarList rows={cohort.gender} empty="—" />
            <p className="text-xs text-muted-foreground">Gender is optional and only shown in aggregate.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reviewers</CardTitle>
          </CardHeader>
          <CardContent>
            {workload.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assignments yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {workload.map((w) => (
                  <li key={w.email} className="flex justify-between">
                    <span>{w.email}</span>
                    <span className="tabular-nums">
                      {w.done}/{w.total}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {batches.length > 0 && (
              <>
                <h3 className="mt-4 text-sm font-semibold">Recent decisions</h3>
                <ul className="text-xs text-muted-foreground">
                  {batches.map((b) => (
                    <li key={b.id}>
                      <Link href={`/admin/selection/batch/${b.id}`} className="underline">
                        {b.action} · {b.applicationIds.length}
                      </Link>{" "}
                      by {b.sentBy}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
