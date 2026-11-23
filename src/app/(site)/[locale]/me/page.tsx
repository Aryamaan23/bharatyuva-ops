import type { Metadata } from "next";
import Link from "next/link";
import { DocumentUpload } from "@/components/portal/document-upload";
import { EmailSignIn } from "@/components/site/email-sign-in";
import { Notice, PageShell } from "@/components/site/page-shell";
import { signInCopy } from "@/components/site/sign-in-copy";
import { Button } from "@/components/ui/button";
import { fill } from "@/i18n/dictionaries/en";
import { getDictionary, resolveLocale } from "@/i18n";
import { bookInterviewAction, respondToOfferAction, setWhatsappAction } from "@/server/applications/actions";
import { loadMyApplication } from "@/server/applications/applicant";
import { getSessionUser } from "@/server/auth/session";
import { formatDate, formatDateTime, formatDayRange } from "@/server/domain/editions";
import { listMyDocuments } from "@/server/privileged/applications";
import { getCurrentEdition } from "@/server/privileged/editions";
import { availableSlots } from "@/server/privileged/selection";
import { fellowEventInfo } from "@/server/privileged/event";
import { qrSvg } from "@/server/privileged/ambassadors";
import { saveEmergencyContactAction } from "@/server/applications/event-actions";
import { SubmissionUpload } from "@/components/portal/submission-upload";
import { Input } from "@/components/ui/input";

export async function generateMetadata({ params }: PageProps<"/[locale]/me">): Promise<Metadata> {
  const t = getDictionary(await resolveLocale(params));
  return { title: t.portal.title, robots: { index: false } };
}

export default async function PortalPage({ params, searchParams }: PageProps<"/[locale]/me">) {
  const locale = await resolveLocale(params);
  const t = getDictionary(locale);
  const sp = await searchParams;
  const edition = await getCurrentEdition();
  const user = await getSessionUser();

  if (!user) {
    return (
      <PageShell locale={locale} t={t} path="/me" title={t.portal.title} contactEmail={edition?.contactEmail}>
        <EmailSignIn
          copy={signInCopy(t, t.portal.signInTitle, t.portal.signInBody)}
          next={`/${locale}/me`}
          locale={locale}
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          linkError={sp.auth_error ? t.apply.errors.linkInvalid : undefined}
        />
      </PageShell>
    );
  }

  const { application, guardian } = edition
    ? await loadMyApplication(user, edition.id)
    : { application: null, guardian: null };

  const signOut = (
    <form action="/auth/signout" method="post" className="mt-10">
      <input type="hidden" name="next" value={`/${locale}`} />
      <p className="mb-2 text-sm text-muted-foreground">{user.email}</p>
      <Button type="submit" variant="outline">
        {t.common.signOut}
      </Button>
    </form>
  );

  if (!edition || !application) {
    return (
      <PageShell locale={locale} t={t} path="/me" title={t.portal.title} contactEmail={edition?.contactEmail}>
        <Notice>{t.portal.noApplication}</Notice>
        <Link href={`/${locale}/apply`} className="mt-4 inline-block rounded-md bg-brand-navy px-5 py-3 font-semibold text-white">
          {t.portal.startApplication}
        </Link>
        {signOut}
      </PageShell>
    );
  }

  const status = application.status;
  const offerOpen =
    status === "selected" && (!application.seatOfferExpiresAt || application.seatOfferExpiresAt > new Date());
  const docs = ["selected", "confirmed"].includes(status) ? await listMyDocuments(user, application.id) : [];
  const docRequests = ["selected", "confirmed"].includes(status) ? edition.postSelectionDocuments : [];
  const interview = status === "interview" ? await availableSlots(edition.id, application.id) : null;
  const mySlot = interview?.slots.find((s) => s.slot.id === interview.mySlotId)?.slot;
  const event = ["confirmed", "attended"].includes(status) ? await fellowEventInfo(user, application.id) : null;
  const passSvg = event ? await qrSvg(event.pass) : null;

  return (
    <PageShell locale={locale} t={t} path="/me" title={t.portal.title} contactEmail={edition.contactEmail}>
      <section aria-labelledby="status" className="rounded-lg border border-border p-5">
        <p className="text-sm font-semibold text-muted-foreground">{edition.name}</p>
        <h2 id="status" className="mt-1 text-xl font-bold text-brand-navy">
          {t.portal.statusLabel}: {t.portal.status[status]}
        </h2>
        <p className="mt-2">{t.portal.statusHelp[status]}</p>
        {application.submittedAt && (
          <p className="mt-2 text-sm text-muted-foreground">
            {fill(t.portal.submittedOn, { date: formatDate(application.submittedAt, locale) })}
          </p>
        )}
        {formatDayRange(edition, locale) && <p className="mt-1 text-sm text-muted-foreground">{formatDayRange(edition, locale)}</p>}
        {status === "draft" && (
          <Link href={`/${locale}/apply`} className="mt-4 inline-block rounded-md bg-brand-navy px-5 py-3 font-semibold text-white">
            {t.portal.continueDraft}
          </Link>
        )}
      </section>

      {application.guardianRequired && !application.guardianConfirmedAt && guardian && (
        <div className="mt-6">
          <Notice tone="warn">{fill(t.portal.guardianPending, { email: guardian.email })}</Notice>
        </div>
      )}

      {status === "selected" && (
        <section aria-labelledby="offer" className="mt-6 rounded-lg border-2 border-brand-gold p-5">
          <h2 id="offer" className="text-lg font-bold text-brand-navy">
            {t.portal.status.selected}
          </h2>
          {application.seatOfferExpiresAt && (
            <p className="mt-1 font-semibold">
              {fill(t.portal.offerExpires, { date: formatDateTime(application.seatOfferExpiresAt, locale) })}
            </p>
          )}
          {offerOpen ? (
            <div className="mt-4 flex flex-wrap items-start gap-3">
              <form action={respondToOfferAction}>
                <input type="hidden" name="applicationId" value={application.id} />
                <input type="hidden" name="decision" value="accept" />
                <input type="hidden" name="locale" value={locale} />
                <Button type="submit" size="lg">
                  {t.portal.acceptSeat}
                </Button>
              </form>
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer font-semibold">{t.portal.declineSeat}</summary>
                <p className="mt-2 max-w-sm text-sm">{t.portal.declineConfirm}</p>
                <form action={respondToOfferAction} className="mt-3">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <input type="hidden" name="decision" value="decline" />
                  <input type="hidden" name="locale" value={locale} />
                  <Button type="submit" variant="destructive">
                    {t.portal.declineConfirmButton}
                  </Button>
                </form>
              </details>
            </div>
          ) : (
            <p className="mt-3">{t.portal.offerExpired}</p>
          )}
        </section>
      )}

      {interview && (
        <section aria-labelledby="interview" className="mt-6 rounded-lg border-2 border-brand-gold p-5">
          <h2 id="interview" className="text-lg font-bold text-brand-navy">
            {t.portal.interviewTitle}
          </h2>
          {sp.slot === "full" && (
            <p role="alert" className="mt-2 text-sm font-semibold text-destructive">
              {t.portal.interviewFull}
            </p>
          )}
          {mySlot && (
            <p className="mt-2 font-semibold">
              {fill(t.portal.interviewBooked, { when: formatDateTime(mySlot.startsAt, locale) })}
              {mySlot.meetingLink && (
                <>
                  <br />
                  {t.portal.interviewLink}:{" "}
                  <a href={mySlot.meetingLink} className="break-all underline" rel="noopener noreferrer" target="_blank">
                    {mySlot.meetingLink}
                  </a>
                </>
              )}
            </p>
          )}
          <p className="mt-2 text-sm">{t.portal.interviewBody}</p>
          {interview.slots.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t.portal.interviewNone}</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {interview.slots.map(({ slot }) => (
                <li key={slot.id}>
                  <form action={bookInterviewAction}>
                    <input type="hidden" name="applicationId" value={application.id} />
                    <input type="hidden" name="slotId" value={slot.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <Button type="submit" variant={slot.id === interview.mySlotId ? "default" : "outline"} className="w-full justify-start" disabled={slot.id === interview.mySlotId}>
                      {formatDateTime(slot.startsAt, locale)}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {event && passSvg && (
        <section aria-labelledby="pass" className="mt-6 rounded-lg border-2 border-brand-navy p-5">
          <h2 id="pass" className="text-lg font-bold text-brand-navy">
            {t.event.passTitle}
          </h2>
          <p className="mt-1 text-sm">{t.event.passBody}</p>
          <div className="mt-3 w-56" role="img" aria-label={t.event.passAlt} dangerouslySetInnerHTML={{ __html: passSvg }} />
          {event.checkedInDays.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {event.checkedInDays
                .filter((d) => !event.feedbackDays.includes(d))
                .map((d) => (
                  <Link key={d} href={`/${locale}/feedback/${d}`} className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-semibold text-brand-navy">
                    {fill(t.event.giveFeedback, { day: d })}
                  </Link>
                ))}
            </div>
          )}
        </section>
      )}

      {event && (
        <section aria-labelledby="team" className="mt-6 rounded-lg border border-border p-5">
          <h2 id="team" className="font-bold text-brand-navy">
            {t.event.teamTitle}
            {event.team ? `: ${event.team.name}` : ""}
          </h2>
          {event.team ? (
            <ul className="mt-2 text-sm">
              {event.teammates.map((m, i) => (
                <li key={i}>
                  {m.name} <span className="text-muted-foreground">· {m.college}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t.event.noTeam}</p>
          )}
          {event.team && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="font-semibold">{t.event.submissionTitle}</h3>
              <p className="text-sm text-muted-foreground">{t.event.submissionBody}</p>
              {event.submissions[0] && <p className="mt-1 text-sm text-green-800">✓ {fill(t.event.submitted, { title: event.submissions[0].title })}</p>}
              <div className="mt-2">
                <SubmissionUpload applicationId={application.id} locale={locale} copy={{ title: t.event.submissionTitleLabel, abstract: t.event.abstractLabel, upload: t.event.uploadPdf, uploading: t.portal.uploading, failed: t.apply.uploadFailed }} />
              </div>
            </div>
          )}
        </section>
      )}

      {event && (
        <section aria-labelledby="emergency" className="mt-6 rounded-lg border border-border p-5">
          <h2 id="emergency" className="font-bold text-brand-navy">
            {t.event.emergencyTitle}
          </h2>
          <p className="mt-1 text-sm">{t.event.emergencyBody}</p>
          <form action={saveEmergencyContactAction} className="mt-3 grid gap-2 sm:grid-cols-3">
            <input type="hidden" name="applicationId" value={application.id} />
            <input type="hidden" name="locale" value={locale} />
            <Input name="name" required defaultValue={event.emergency?.name ?? ""} placeholder={t.event.emergencyName} aria-label={t.event.emergencyName} />
            <Input name="relation" required defaultValue={event.emergency?.relation ?? ""} placeholder={t.event.emergencyRelation} aria-label={t.event.emergencyRelation} />
            <Input name="phone" type="tel" required defaultValue={event.emergency?.phone ?? ""} placeholder={t.event.emergencyPhone} aria-label={t.event.emergencyPhone} />
            <Input name="medicalNotes" defaultValue={event.emergency?.medicalNotes ?? ""} placeholder={t.event.medicalNotes} aria-label={t.event.medicalNotes} className="sm:col-span-3" />
            <Button type="submit" variant="outline" className="sm:w-fit">
              {event.emergency ? t.event.saved + " · " + t.event.save : t.event.save}
            </Button>
          </form>
        </section>
      )}

      {event && event.certificates.length > 0 && (
        <section aria-labelledby="certs" className="mt-6 rounded-lg border border-brand-gold bg-brand-gold-soft p-5">
          <h2 id="certs" className="font-bold text-brand-navy">
            {t.event.certificatesTitle}
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {event.certificates.map((c) => (
              <li key={c.id}>
                {c.kind} ·{" "}
                <a href={`/certificates/${c.code}.pdf`} className="font-semibold underline" target="_blank" rel="noopener">
                  {t.event.downloadCertificate}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {docRequests.length > 0 && (
        <section aria-labelledby="docs" className="mt-6 space-y-3">
          <h2 id="docs" className="text-lg font-bold text-brand-navy">
            {t.portal.documentsTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{t.portal.documentsBody}</p>
          {docRequests.map((d) => (
            <DocumentUpload
              key={d.key}
              applicationId={application.id}
              kind={d.key}
              label={(locale === "hi" && d.label.hi) || d.label.en}
              uploadedName={docs.find((x) => x.kind === d.key)?.fileName ?? null}
              locale={locale}
              copy={{
                upload: t.portal.upload,
                uploading: t.portal.uploading,
                uploaded: t.portal.uploaded,
                replace: t.portal.replace,
                failed: t.apply.uploadFailed,
              }}
            />
          ))}
        </section>
      )}

      {status !== "draft" && (
        <section aria-labelledby="wa" className="mt-6 rounded-lg border border-border p-5">
          <h2 id="wa" className="font-bold text-brand-navy">
            {t.portal.whatsappTitle}
          </h2>
          <p className="mt-1">{application.whatsappOptIn ? t.portal.whatsappOn : t.portal.whatsappOff}</p>
          <form action={setWhatsappAction} className="mt-3">
            <input type="hidden" name="applicationId" value={application.id} />
            <input type="hidden" name="optIn" value={application.whatsappOptIn ? "false" : "true"} />
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" variant="outline">
              {application.whatsappOptIn ? t.portal.whatsappStop : t.portal.whatsappStart}
            </Button>
          </form>
        </section>
      )}

      <section aria-labelledby="data" className="mt-6">
        <h2 id="data" className="font-bold text-brand-navy">
          {t.portal.yourData}
        </h2>
        <p className="mt-1">{t.portal.yourDataBody}</p>
        <Link href={`/${locale}/data-request`} className="mt-1 inline-block text-brand-navy underline">
          {t.common.dataRequest}
        </Link>
      </section>
      {signOut}
    </PageShell>
  );
}
