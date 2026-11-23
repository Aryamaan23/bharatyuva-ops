import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/admin/ui";
import { ReviewForm } from "@/components/selection/review-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/server/auth/session";
import { reviewerQueue, reviewerView } from "@/server/privileged/selection";

export const metadata = { title: "Review" };

export default async function ReviewPage({ params }: PageProps<"/admin/reviews/[id]">) {
  const session = await requireStaff(["reviewer", "owner", "admin"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const view = await reviewerView(id, session.email);
  if (!view) notFound();
  const queue = await reviewerQueue(session.email);
  const next = queue.find((q) => q.status === "assigned" && q.id !== id);
  return (
    <>
      <PageHeader
        title={`Application ${view.reference}`}
        description="Score from the answers. Contact details and identity are hidden."
        actions={
          <Link href="/admin/reviews" className="text-sm underline">
            All my reviews
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {view.summary && (
            <Card className="border-dashed border-brand-gold bg-brand-gold-soft">
              <CardHeader>
                <CardTitle className="text-sm">AI summary: may be wrong. Score from the answers below.</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-line text-sm">{view.summary}</CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Answers</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4">
                {view.answers.map((a) => (
                  <div key={a.id}>
                    <dt className="text-sm font-semibold text-muted-foreground">{a.question}</dt>
                    <dd className="whitespace-pre-line break-words">{a.answer || "—"}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-2">
          <Card className="lg:sticky lg:top-4">
            <CardHeader>
              <CardTitle className="text-base">Your scores</CardTitle>
            </CardHeader>
            <CardContent>
              <ReviewForm
                assignmentId={id}
                rubric={view.rubric}
                initialScores={view.review?.scores ?? {}}
                initialComment={view.review?.comment ?? ""}
                nextHref={next ? `/admin/reviews/${next.id}` : null}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
