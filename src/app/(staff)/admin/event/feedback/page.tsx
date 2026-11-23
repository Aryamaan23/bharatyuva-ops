import Link from "next/link";
import { PageHeader, Stat } from "@/components/admin/ui";
import { Card, CardContent } from "@/components/ui/card";
import { requireStaff } from "@/server/auth/session";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { feedbackResults } from "@/server/event/queries";

export const metadata = { title: "Feedback" };

export default async function FeedbackPage() {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Feedback" />;
  const { byDay, comments } = await feedbackResults(session, edition.id);
  return (
    <>
      <PageHeader title="Feedback" description="Feedback links go to fellows who checked in, at 18:00 on each event day." actions={<Link href="/admin/event" className="text-sm underline">Event & after</Link>} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((d) => {
          const r = byDay.find((b) => b.day === d);
          return <Stat key={d} label={`Day ${d}`} value={r?.avg ? `${r.avg}/5` : "—"} hint={r ? `${r.n} responses` : "no responses"} />;
        })}
      </div>
      <div className="space-y-2">
        {comments
          .filter((c) => c.answers.liked || c.answers.improve)
          .map((c, i) => (
            <Card key={i}>
              <CardContent className="space-y-1 py-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Day {c.day} · {c.rating}/5
                </p>
                {c.answers.liked && <p><strong>Liked:</strong> {c.answers.liked}</p>}
                {c.answers.improve && <p><strong>Improve:</strong> {c.answers.improve}</p>}
              </CardContent>
            </Card>
          ))}
        {comments.length === 0 && <p className="text-sm text-muted-foreground">No feedback yet.</p>}
      </div>
    </>
  );
}
