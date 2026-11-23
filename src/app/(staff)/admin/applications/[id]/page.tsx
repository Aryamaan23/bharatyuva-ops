import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { allQuestions } from "@/lib/forms/definition";
import { APPLICATION_STATUSES, getApplicationDetail } from "@/server/applications/staff";
import { changeApplicationStatus, clearDuplicateFlag } from "@/server/applications/staff-actions";
import { ADMIN_ROLES, hasRole, requireStaff } from "@/server/auth/session";
import { formatDate, formatDateTime } from "@/server/domain/editions";
import { getFormVersion } from "@/server/privileged/editions";

export const metadata = { title: "Application" };

export default async function ApplicationDetailPage({ params }: PageProps<"/admin/applications/[id]">) {
  const session = await requireStaff();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const detail = await getApplicationDetail(session, id);
  if (!detail) notFound();
  const { application: app, applicant, consents, guardian, documents } = detail;
  const form = await getFormVersion(app.editionId, app.formVersion);
  const questions = form ? allQuestions(form.definition) : [];

  return (
    <>
      <PageHeader
        title={applicant.fullName ?? applicant.email}
        description={`${app.status.replace("_", " ")} · form v${app.formVersion}${app.submittedAt ? ` · submitted ${formatDateTime(app.submittedAt)}` : ""}`}
        actions={
          <Link href="/admin/applications" className="text-sm underline">
            Back to list
          </Link>
        }
      />
      {app.duplicateOf && (
        <Card className="mb-4 border-destructive">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
            <span>
              Possible duplicate ({app.duplicateReason?.replace("_", " ")}) of{" "}
              <Link href={`/admin/applications/${app.duplicateOf}`} className="font-semibold underline">
                this application
              </Link>
              .
            </span>
            {hasRole(session, ...ADMIN_ROLES) && (
              <form action={clearDuplicateFlag}>
                <input type="hidden" name="applicationId" value={app.id} />
                <Button size="sm" variant="outline">
                  Not a duplicate
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Answers</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-4">
                {questions.map((q) => {
                  const v = app.answers[q.id];
                  return (
                    <div key={q.id}>
                      <dt className="text-sm font-semibold text-muted-foreground">
                        {q.label.en} {q.pii && <Badge variant="outline">PII</Badge>}
                      </dt>
                      <dd className="whitespace-pre-line break-words">
                        {Array.isArray(v) ? v.join(", ") : q.type === "file" ? (v ? "File uploaded" : "—") : v || "—"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change status</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={changeApplicationStatus} className="space-y-3">
                <input type="hidden" name="applicationId" value={app.id} />
                <label htmlFor="status" className="sr-only">
                  Status
                </label>
                <select id="status" name="status" defaultValue={app.status} className="block h-9 w-full rounded-md border border-input bg-white px-2 text-sm">
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace("_", " ")}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="notify" className="size-4" /> Email the applicant
                </label>
                <p className="text-xs text-muted-foreground">
                  Choosing &quot;selected&quot; starts a seat offer that expires after the edition&apos;s confirmation window.
                </p>
                <Button type="submit" className="w-full">
                  Update status
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Applicant</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>{applicant.email}</p>
              <p>{applicant.phoneE164 ?? "No phone"}</p>
              <p>
                {applicant.college ?? "—"}, {applicant.state ?? "—"}
              </p>
              {applicant.dateOfBirth && <p>Born {formatDate(applicant.dateOfBirth)}</p>}
              <p>Source: {app.attribution.source ?? "direct"}{app.attribution.campaign ? ` / ${app.attribution.campaign}` : ""}</p>
              {app.referralCode && <p>Referral: {app.referralCode}</p>}
              <p>WhatsApp: {app.whatsappOptIn ? "opted in" : "no"}</p>
              {app.seatOfferExpiresAt && <p>Offer expires {formatDateTime(app.seatOfferExpiresAt)}</p>}
            </CardContent>
          </Card>
          {guardian && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Guardian</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  {guardian.guardianName} ({guardian.guardianRelation})
                </p>
                <p>{guardian.guardianEmail}</p>
                <p>{guardian.confirmedAt ? `Consented ${formatDateTime(guardian.confirmedAt)}` : "Consent pending"}</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Consent record</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {consents.map((c, i) => (
                  <li key={i}>
                    {c.kind} v{c.version}: <strong>{c.granted ? "granted" : "declined"}</strong>{" "}
                    <span className="text-muted-foreground">{formatDateTime(c.recordedAt)}</span>
                  </li>
                ))}
                {consents.length === 0 && <li className="text-muted-foreground">None yet (draft).</li>}
              </ul>
            </CardContent>
          </Card>
          {documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {documents.map((d) => (
                    <li key={d.id}>
                      {d.kind}: {d.fileName}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
