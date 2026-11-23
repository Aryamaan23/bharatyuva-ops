import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { Card, CardContent } from "@/components/ui/card";
import { requireStaff } from "@/server/auth/session";
import { formatDateTime } from "@/server/domain/editions";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { listSubmissions } from "@/server/event/queries";

export const metadata = { title: "Submissions" };

export default async function SubmissionsPage() {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Submissions" />;
  const rows = await listSubmissions(session, edition.id);
  return (
    <>
      <PageHeader title="Practicum submissions" description="Teams upload from their portal. The latest upload per team goes into the compendium." actions={<Link href="/admin/event" className="text-sm underline">Event & after</Link>} />
      <div className="space-y-2">
        {rows.map(({ s, team }) => (
          <Card key={s.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
              <div>
                <p className="font-semibold">
                  {team}: {s.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.fileName} · {formatDateTime(s.createdAt)}
                </p>
                {s.abstract && <p className="mt-1">{s.abstract}</p>}
              </div>
              <a href={`/admin/event/submissions/${s.id}/download`} className="underline" target="_blank" rel="noopener">
                Download PDF
              </a>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
      </div>
    </>
  );
}
