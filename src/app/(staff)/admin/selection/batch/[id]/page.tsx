import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isLocale } from "@/i18n/config";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { formatDateTime } from "@/server/domain/editions";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { offerExpiryFromNow, renderDecision, type DecisionAction } from "@/server/privileged/selection";
import { sendDecisionAction } from "@/server/selection/actions";
import { batchApplicants, getBatch } from "@/server/selection/queries";

export const metadata = { title: "Decision preview" };

export default async function BatchPage({ params }: PageProps<"/admin/selection/batch/[id]">) {
  const session = await requireStaff(ADMIN_ROLES);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [batch, edition] = await Promise.all([getBatch(session, id), getCurrentEditionForStaff(session)]);
  if (!batch || !edition) notFound();
  const people = await batchApplicants(session, batch.applicationIds);
  const action = batch.action as DecisionAction;
  const expiresAt = action === "selected" ? offerExpiryFromNow(edition.seatConfirmHours) : null;
  const samples = people.slice(0, 3).map((p) => ({ p, email: renderDecision(action, isLocale(p.locale) ? p.locale : "en", { name: p.name ?? "", editionName: edition.name, expiresAt }) }));
  const result = batch.result as { emails?: number; applications?: number };

  return (
    <>
      <PageHeader
        title={`${batch.status === "sent" ? "Sent" : "Preview"}: ${action.replace("_", " ")} · ${people.length} applicant${people.length === 1 ? "" : "s"}`}
        description={batch.status === "sent" ? `Sent by ${batch.sentBy} on ${batch.sentAt ? formatDateTime(batch.sentAt) : ""}: ${result.emails ?? 0} emails queued.` : "Check the emails below. Applicants who opted in also get a WhatsApp update."}
        actions={
          <Link href="/admin/selection" className="text-sm underline">
            Back to selection
          </Link>
        }
      />
      {batch.status === "draft" && (
        <Card className="mb-4 border-brand-gold">
          <CardContent className="space-y-2 py-4 text-sm">
            <p>
              This will set {people.length} application{people.length === 1 ? "" : "s"} to <strong>{action}</strong>
              {expiresAt && `, with seat offers expiring ${formatDateTime(expiresAt)}`}, and email each applicant. Each person gets this email at most once.
            </p>
            <form action={sendDecisionAction} className="flex items-center gap-3">
              <input type="hidden" name="batchId" value={batch.id} />
              <label className="flex items-center gap-2">
                <input type="checkbox" name="confirm" value="yes" required className="size-4" /> I&apos;ve checked the list and the email
              </label>
              <Button type="submit">Send {people.length} emails</Button>
            </form>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {samples.map(({ p, email }) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="text-sm">
                To {p.name} &lt;{p.email}&gt;
                <br />
                <span className="font-normal">{email.subject}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap font-sans text-sm">{email.text}</pre>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Everyone in this batch</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="columns-1 text-sm sm:columns-2 lg:columns-3">
            {people.map((p) => (
              <li key={p.id}>
                {p.name ?? p.email} <span className="text-xs text-muted-foreground">({p.status})</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
