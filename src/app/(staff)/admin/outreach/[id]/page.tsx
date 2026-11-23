import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/admin/ui";
import { STAGE_LABELS, STEP_LABELS, TEMP_CLASS, TYPE_LABELS } from "@/components/outreach/labels";
import { PartnerLinkCreator } from "@/components/outreach/partner-link";
import { PersonalLineField } from "@/components/outreach/suggest-line";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { aiConfigured } from "@/server/ai/client";
import { requireStaff } from "@/server/auth/session";
import { temperature } from "@/server/db/schema";
import { formatDateTime } from "@/server/domain/editions";
import { addContact, addPartnerNote, revokePartnerLinksAction, setPrimaryContact, simulateReplyAction, updatePartnership } from "@/server/outreach/actions";
import { getPartnership, listStaffOptions, STAGES } from "@/server/outreach/crm";

export const metadata = { title: "Partner" };

const select = "block h-9 w-full rounded-md border border-input bg-white px-2 text-sm";

export default async function PartnerPage({ params }: PageProps<"/admin/outreach/[id]">) {
  const session = await requireStaff();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [data, staff] = await Promise.all([getPartnership(session, id), listStaffOptions(session)]);
  if (!data) notFound();
  const { p, org } = data;
  const isDev = process.env.VERCEL_ENV !== "production";
  const primary = data.contacts.find((c) => c.id === p.primaryContactId) ?? data.contacts.find((c) => c.isPrimary) ?? data.contacts[0];

  return (
    <>
      <PageHeader
        title={org.name}
        description={[TYPE_LABELS[org.type], org.location].filter(Boolean).join(" · ")}
        actions={
          <Link href="/admin/outreach" className="text-sm underline">
            Back to pipeline
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge variant="secondary">{STAGE_LABELS[p.stage]}</Badge>
        <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${TEMP_CLASS[p.temperature]}`}>{p.temperature}</span>
        {p.pastPartner && <Badge className="bg-brand-gold text-brand-navy">Past partner</Badge>}
        {org.needsVerification && <Badge className="border-amber-500 bg-amber-100 text-amber-900">Check before sending</Badge>}
        {org.doNotContact && <Badge variant="destructive">Do not contact</Badge>}
      </div>
      {org.doNotContact && (
        <Card className="mb-4 border-destructive">
          <CardContent className="py-3 text-sm">This organisation asked not to be contacted. {org.doNotContactReason}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={addPartnerNote} className="space-y-2">
                <input type="hidden" name="id" value={p.id} />
                <label htmlFor="note" className="sr-only">
                  Add a note
                </label>
                <Textarea id="note" name="body" rows={2} placeholder="Add a note, or log a call…" required />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" name="kind" value="note">
                    Add note
                  </Button>
                  <Button type="submit" size="sm" variant="outline" name="kind" value="call">
                    Log call
                  </Button>
                </div>
              </form>
              <ol className="space-y-3 border-l-2 border-border pl-4">
                {data.timeline.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(a.at)} · {a.kind.replace(/_/g, " ")} · {a.actorEmail}
                    </p>
                    {a.body && <p className="whitespace-pre-line">{a.body}</p>}
                  </li>
                ))}
                {data.timeline.length === 0 && <li className="text-sm text-muted-foreground">No activity yet.</li>}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sequence</CardTitle>
            </CardHeader>
            <CardContent>
              {data.steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not scheduled. Select this partner in the pipeline and choose “Schedule first email”.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.steps.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <span>
                        {STEP_LABELS[s.step]} · due {s.dueAt}
                      </span>
                      <span className="font-semibold">{s.status}</span>
                    </li>
                  ))}
                </ul>
              )}
              {data.thread && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Gmail thread from {data.thread.senderEmail}
                  {data.thread.replyDetectedAt ? ` · ${data.thread.replyKind} detected ${formatDateTime(data.thread.replyDetectedAt)}` : " · waiting for a reply (checked hourly)"}
                </p>
              )}
            </CardContent>
          </Card>

          {data.tasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Open tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {data.tasks.map((t) => (
                    <li key={t.id}>
                      <strong>{t.title}</strong> {t.dueAt && <span className="text-muted-foreground">· due {t.dueAt}</span>}
                      {t.checklist.length > 0 && (
                        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                          {t.checklist.map((c) => (
                            <li key={c.label}>{c.label}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                <Link href="/admin/tasks" className="mt-2 inline-block text-sm underline">
                  Manage tasks
                </Link>
              </CardContent>
            </Card>
          )}

          {data.requests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Questions from the partner</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {data.requests.map((r) => (
                  <div key={r.id}>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(r.createdAt)} · {r.fromName}
                    </p>
                    <p className="whitespace-pre-line">{r.message}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updatePartnership} className="space-y-3">
                <input type="hidden" name="id" value={p.id} />
                <div>
                  <label htmlFor="stage" className="text-sm font-semibold">
                    Stage
                  </label>
                  <select id="stage" name="stage" defaultValue={p.stage} className={select}>
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="temperature" className="text-sm font-semibold">
                      Temperature
                    </label>
                    <select id="temperature" name="temperature" defaultValue={p.temperature} className={select}>
                      {temperature.enumValues.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="nextActionAt" className="text-sm font-semibold">
                      Next action
                    </label>
                    <Input id="nextActionAt" name="nextActionAt" type="date" defaultValue={p.nextActionAt ?? ""} />
                  </div>
                </div>
                <div>
                  <label htmlFor="ownerEmail" className="text-sm font-semibold">
                    Owner
                  </label>
                  <select id="ownerEmail" name="ownerEmail" defaultValue={p.ownerEmail ?? ""} className={select}>
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.email} value={s.email}>
                        {s.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <PersonalLineField partnershipId={p.id} initial={p.personalLine ?? ""} aiAvailable={aiConfigured()} />
                <Button type="submit" className="w-full">
                  Save
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contacts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {data.contacts.map((c) => (
                <div key={c.id} className="rounded-md border border-border p-2">
                  <p className="font-semibold">
                    {c.name ?? c.roleTitle ?? "Office"} {c.id === primary?.id && <Badge className="ml-1 h-5">primary</Badge>}
                    {c.bouncedAt && <Badge variant="destructive" className="ml-1 h-5">bounced</Badge>}
                  </p>
                  {c.name && c.roleTitle && <p className="text-muted-foreground">{c.roleTitle}</p>}
                  {c.email && <p className="break-all">{c.email}</p>}
                  {c.phone && <p>{c.phone}</p>}
                  {c.id !== primary?.id && c.email && (
                    <form action={setPrimaryContact}>
                      <input type="hidden" name="partnershipId" value={p.id} />
                      <input type="hidden" name="contactId" value={c.id} />
                      <button type="submit" className="text-xs underline">
                        Make primary
                      </button>
                    </form>
                  )}
                </div>
              ))}
              <details>
                <summary className="cursor-pointer font-semibold">Add a contact</summary>
                <form action={addContact} className="mt-2 space-y-2">
                  <input type="hidden" name="partnershipId" value={p.id} />
                  <input type="hidden" name="organisationId" value={org.id} />
                  <Input name="name" placeholder="Name" aria-label="Name" />
                  <Input name="roleTitle" placeholder="Role / office" aria-label="Role" />
                  <Input name="email" type="email" placeholder="Email" aria-label="Email" />
                  <Input name="phone" placeholder="Phone" aria-label="Phone" />
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="primary" className="size-4" /> Make primary
                  </label>
                  <Button type="submit" size="sm">
                    Add
                  </Button>
                </form>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {org.fitReason && <p><strong>Why them:</strong> {org.fitReason}</p>}
              {org.suggestedApproach && <p><strong>Way in:</strong> {org.suggestedApproach}</p>}
              {org.notes && <p className="whitespace-pre-line"><strong>Notes:</strong> {org.notes}</p>}
              {org.verificationNote && <p><strong>Verification:</strong> {org.verificationNote}</p>}
              {org.sourceUrl && (
                <p className="break-all">
                  <strong>Source:</strong>{" "}
                  <a href={org.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    {org.sourceUrl}
                  </a>
                </p>
              )}
              {org.website && (
                <p className="break-all">
                  <strong>Website:</strong>{" "}
                  <a href={org.website} target="_blank" rel="noopener noreferrer" className="underline">
                    {org.website}
                  </a>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Partner day details</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updatePartnership} className="space-y-2 text-sm">
                <input type="hidden" name="id" value={p.id} />
                {org.type === "district" && (
                  <fieldset className="space-y-2">
                    <legend className="font-semibold">Nodal officer</legend>
                    <Input name="nodalName" placeholder="Name" aria-label="Nodal officer name" defaultValue={p.nodalOfficer.name ?? ""} />
                    <Input name="nodalRole" placeholder="Designation" aria-label="Nodal officer designation" defaultValue={p.nodalOfficer.role ?? ""} />
                    <Input name="nodalPhone" placeholder="Phone" aria-label="Nodal officer phone" defaultValue={p.nodalOfficer.phone ?? ""} />
                    <Input name="nodalEmail" placeholder="Email" aria-label="Nodal officer email" defaultValue={p.nodalOfficer.email ?? ""} />
                  </fieldset>
                )}
                <label htmlFor="dayPlan" className="font-semibold">
                  Day plan (shown on their partner page)
                </label>
                <Textarea id="dayPlan" name="dayPlan" rows={4} defaultValue={p.dayPlan ?? ""} />
                <label htmlFor="thankYouPhotosUrl" className="font-semibold">
                  Photo album link (for the thank-you note)
                </label>
                <Input id="thankYouPhotosUrl" name="thankYouPhotosUrl" type="url" defaultValue={p.thankYouPhotosUrl ?? ""} />
                <Button type="submit" size="sm">
                  Save details
                </Button>
              </form>
              {org.type === "district" && (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <a href={`/admin/outreach/${p.id}/letter`} target="_blank" rel="noopener">
                    Download formal letter (PDF)
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Private partner page</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                A link to their day plan, our contacts, the share kit and a question form. The fellow list appears once the stage is Confirmed.
              </p>
              <PartnerLinkCreator partnershipId={p.id} defaultEmail={primary?.email ?? null} />
              {data.links.length > 0 && (
                <>
                  <ul className="text-xs text-muted-foreground">
                    {data.links.map((l) => (
                      <li key={l.id}>
                        {l.contactEmail ?? "link"} · created {formatDateTime(l.createdAt)}
                        {l.revokedAt ? " · revoked" : l.lastSeenAt ? ` · last opened ${formatDateTime(l.lastSeenAt)}` : " · not opened yet"}
                      </li>
                    ))}
                  </ul>
                  <form action={revokePartnerLinksAction}>
                    <input type="hidden" name="partnershipId" value={p.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Revoke all links
                    </Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>

          {isDev && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Simulate a reply (development only)</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={simulateReplyAction} className="space-y-2 text-sm">
                  <input type="hidden" name="partnershipId" value={p.id} />
                  <Input name="from" defaultValue={primary?.email ?? "partner@example.org"} aria-label="From" />
                  <Textarea name="body" rows={2} defaultValue="Thank you, we'd be happy to discuss. Please call my office." aria-label="Reply text" />
                  <p className="text-xs text-muted-foreground">Try “No thanks” (opt-out) or a From of mailer-daemon@… (bounce).</p>
                  <Button type="submit" size="sm" variant="outline">
                    Simulate
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
