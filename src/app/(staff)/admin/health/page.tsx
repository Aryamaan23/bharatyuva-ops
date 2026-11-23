import { PageHeader, Stat, timeAgo } from "@/components/admin/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireStaff } from "@/server/auth/session";
import { formatDateTime } from "@/server/domain/editions";
import { JOBS } from "@/server/jobs/registry";
import { latestJobRuns, outboxSummary, recentJobRuns } from "@/server/platform/health";

export const metadata = { title: "Health" };

export default async function HealthPage() {
  const session = await requireStaff();
  const [latest, recent, outbox] = await Promise.all([latestJobRuns(session), recentJobRuns(session), outboxSummary(session)]);
  const count = (s: string) => outbox.byStatus.find((r) => r.status === s)?.n ?? 0;
  return (
    <>
      <PageHeader title="Health" description="Automation runs and the message outbox. Failed messages need a look." />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Emails sent today (IST)" value={outbox.sentToday} />
        <Stat label="Waiting to send" value={count("pending")} />
        <Stat label="Failed" value={count("failed")} />
        <Stat label="Logged only (not sent)" value={count("logged")} hint="MESSAGE_MODE=log or no test inbox" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Scheduled jobs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(JOBS).map(([name, job]) => {
                const run = latest.find((r) => r.job === name);
                return (
                  <TableRow key={name}>
                    <TableCell className="font-mono text-sm">{name}</TableCell>
                    <TableCell>{job.schedule}</TableCell>
                    <TableCell>{run ? `${formatDateTime(run.startedAt)} (${timeAgo(run.startedAt)})` : "never"}</TableCell>
                    <TableCell className={run?.status === "failed" ? "font-semibold text-destructive" : ""}>
                      {run ? `${run.status}, ${run.itemsProcessed} items${run.error ? `: ${run.error}` : ""}` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {outbox.failed.length > 0 && (
        <Card className="mt-6 border-destructive">
          <CardHeader>
            <CardTitle className="text-base">Failed messages</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {outbox.failed.map((m) => (
                <li key={m.id}>
                  <strong>{m.template}</strong> to {m.to} after {m.attempts} attempts: {m.lastError}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {recent.map((r) => (
              <li key={r.id}>
                {formatDateTime(r.startedAt)} · <span className="font-mono">{r.job}</span> ({r.trigger}) · {r.status} · {r.itemsProcessed}{" "}
                items
              </li>
            ))}
            {recent.length === 0 && <li className="text-muted-foreground">No runs yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
