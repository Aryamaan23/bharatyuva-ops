import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireStaff } from "@/server/auth/session";
import { reviewerQueue } from "@/server/privileged/selection";

export const metadata = { title: "My reviews" };

export default async function ReviewsPage() {
  const session = await requireStaff(["reviewer", "owner", "admin"]);
  const queue = await reviewerQueue(session.email);
  const open = queue.filter((q) => q.status === "assigned");
  return (
    <>
      <PageHeader title="My reviews" description={`${open.length} to do, ${queue.length - open.length} done. You see each application's answers without the applicant's name or contact details.`} />
      {queue.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">No applications assigned to you yet.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {queue.map((q) => (
            <li key={q.id}>
              <Link href={`/admin/reviews/${q.id}`} className="flex items-center justify-between rounded-lg border border-border bg-white p-3 hover:border-brand-navy">
                <span className="font-semibold">Application #{q.applicationId.slice(0, 6).toUpperCase()}</span>
                <span className="flex items-center gap-2 text-sm">
                  {q.total !== null && <span className="tabular-nums">{q.total}%</span>}
                  <Badge variant={q.status === "assigned" ? "outline" : "secondary"}>{q.status === "assigned" ? "to review" : "reviewed"}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
