import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ApplicationForm } from "@/components/apply/application-form";
import { EmailSignIn } from "@/components/site/email-sign-in";
import { Notice, PageShell } from "@/components/site/page-shell";
import { signInCopy } from "@/components/site/sign-in-copy";
import { ATTRIBUTION_COOKIE, REFERRAL_COOKIE, parseAttributionCookie, sanitizeReferral } from "@/lib/attribution";
import { fill } from "@/i18n/dictionaries/en";
import { getDictionary, resolveLocale } from "@/i18n";
import { loadMyApplication, startOrResumeDraft } from "@/server/applications/applicant";
import { getSessionUser } from "@/server/auth/session";
import { applicationWindow, formatDate } from "@/server/domain/editions";
import { getCurrentConsents, getCurrentEdition, getFormVersion, getPublishedForm } from "@/server/privileged/editions";

export async function generateMetadata({ params }: PageProps<"/[locale]/apply">): Promise<Metadata> {
  const t = getDictionary(await resolveLocale(params));
  return { title: t.common.apply, robots: { index: false } };
}

export default async function ApplyPage({ params, searchParams }: PageProps<"/[locale]/apply">) {
  const locale = await resolveLocale(params);
  const t = getDictionary(locale);
  const sp = await searchParams;
  const edition = await getCurrentEdition();
  const shell = (title: string, body: React.ReactNode) => (
    <PageShell locale={locale} t={t} path="/apply" title={title} contactEmail={edition?.contactEmail}>
      {body}
    </PageShell>
  );

  if (!edition) return shell(t.common.apply, <Notice>{t.apply.noEdition}</Notice>);
  const title = fill(t.apply.title, { edition: edition.name });
  const appWindow = applicationWindow(edition, new Date());
  const closedNotice =
    appWindow === "closed" && edition.applicationsCloseAt ? (
      <Notice>{fill(t.apply.closed, { edition: edition.name, date: formatDate(edition.applicationsCloseAt, locale) })}</Notice>
    ) : appWindow === "not_open" ? (
      <Notice>{fill(t.apply.notOpen, { edition: edition.name })}</Notice>
    ) : null;

  const user = await getSessionUser();
  if (!user) {
    if (closedNotice) return shell(title, closedNotice);
    return shell(
      title,
      <EmailSignIn
        copy={signInCopy(t, t.apply.startTitle, t.apply.startBody)}
        next={`/${locale}/apply`}
        locale={locale}
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        linkError={sp.auth_error ? t.apply.errors.linkInvalid : undefined}
      />,
    );
  }

  const existing = await loadMyApplication(user, edition.id);
  if (existing.application && existing.application.status !== "draft") {
    return shell(
      title,
      <Notice tone="success">
        <p>{fill(t.apply.alreadySubmitted, { edition: edition.name })}</p>
        <Link href={`/${locale}/me`} className="mt-2 inline-block font-semibold text-brand-navy underline">
          {t.apply.goToPortal}
        </Link>
      </Notice>,
    );
  }
  if (closedNotice) return shell(title, closedNotice);

  const published = await getPublishedForm(edition.id);
  if (!published) return shell(title, <Notice>{t.apply.noEdition}</Notice>);

  const jar = await cookies();
  const application =
    existing.application ??
    (await startOrResumeDraft(user, edition, published, {
      locale,
      attribution: parseAttributionCookie(jar.get(ATTRIBUTION_COOKIE)?.value),
      referralCode: sanitizeReferral(jar.get(REFERRAL_COOKIE)?.value),
    }));
  // Applicants keep the form version they started with, even if admins publish a new one.
  const form = (await getFormVersion(edition.id, application.formVersion)) ?? published;
  const consents = await getCurrentConsents();
  const consentText = (c: { textEn: string; textHi: string } | null) => (c ? (locale === "hi" && c.textHi) || c.textEn : "");

  return shell(
    title,
    <ApplicationForm
      applicationId={application.id}
      locale={locale}
      definition={form.definition}
      initialAnswers={application.answers}
      initialStep={application.currentStep}
      t={{ apply: t.apply, common: t.common, portal: t.portal }}
      consentText={{ processing: consentText(consents.processing), whatsapp: consentText(consents.whatsapp) }}
      privacyHref={`/${locale}/privacy`}
    />,
  );
}
