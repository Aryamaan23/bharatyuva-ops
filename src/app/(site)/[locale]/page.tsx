import Link from "next/link";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { fill } from "@/i18n/dictionaries/en";
import { getDictionary, resolveLocale, type Locale } from "@/i18n";
import { applicationWindow, formatDate, formatDateTime, formatDayRange } from "@/server/domain/editions";
import { getCurrentEdition, type Edition } from "@/server/privileged/editions";

// Static, refreshed every 5 minutes: fast on low-end phones and slow networks.
export const revalidate = 300;

async function loadEdition(): Promise<Edition | null> {
  try {
    return await getCurrentEdition();
  } catch (err) {
    // The landing page must still render if the database is unreachable at build time.
    console.error("landing: could not load edition", err);
    return null;
  }
}

export default async function LandingPage({ params }: PageProps<"/[locale]">) {
  const locale: Locale = await resolveLocale(params);
  const t = getDictionary(locale);
  const edition = await loadEdition();
  const appWindow = edition ? applicationWindow(edition, new Date()) : "not_open";
  const dates = edition ? formatDayRange(edition, locale) : null;

  const venueFor = (day: 0 | 1 | 2) => {
    const v = edition?.venues[(["day1", "day2", "day3"] as const)[day]];
    return v ? [v.partnerName ?? v.name, v.city].filter(Boolean).join(", ") : null;
  };

  return (
    <>
      <SiteHeader locale={locale} t={t} />
      <main id="main" className="flex-1">
        <section className="bg-brand-navy text-white">
          <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
            <p className="mb-3 inline-block rounded bg-brand-gold px-2 py-0.5 text-sm font-semibold text-brand-navy">
              {edition?.name ?? t.common.programme} · {t.landing.eyebrow}
            </p>
            <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-5xl">{t.landing.heroTitle}</h1>
            <p className="mt-5 max-w-2xl text-lg text-white/90">{t.landing.heroBody}</p>
            <p className="mt-4 font-semibold">{dates ?? t.common.dateTbc}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <ApplyButton locale={locale} t={t} appWindow={appWindow} />
              {appWindow === "open" && edition?.applicationsCloseAt && (
                <span className="text-sm text-white/90">
                  {t.common.deadline}: {formatDateTime(edition.applicationsCloseAt, locale)}
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-14" aria-labelledby="days">
          <h2 id="days" className="text-2xl font-bold text-brand-navy">
            {t.landing.daysTitle}
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {t.landing.days.map((d, i) => (
              <li key={d.label} className="rounded-lg border border-border p-5">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{d.label}</p>
                <p className="mt-1 text-xl font-bold text-brand-navy">{d.title}</p>
                <p className="mt-2">{d.body}</p>
                {venueFor(i as 0 | 1 | 2) && <p className="mt-3 text-sm font-semibold">{venueFor(i as 0 | 1 | 2)}</p>}
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-brand-gold-soft" aria-labelledby="proof">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 id="proof" className="text-2xl font-bold text-brand-navy">
              {t.landing.proofTitle}
            </h2>
            <dl className="mt-6 grid gap-6 sm:grid-cols-3">
              {t.landing.proof.map((p) => (
                <div key={p.label}>
                  <dt className="sr-only">{p.label}</dt>
                  <dd>
                    <span className="block text-4xl font-bold text-brand-navy">{p.value}</span>
                    <span>{p.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 max-w-3xl">{t.landing.proofNote}</p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-14" aria-labelledby="who">
          <h2 id="who" className="text-2xl font-bold text-brand-navy">
            {t.landing.whoTitle}
          </h2>
          <p className="mt-4 max-w-3xl text-lg">{t.landing.whoBody}</p>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-14" aria-labelledby="faq">
          <h2 id="faq" className="text-2xl font-bold text-brand-navy">
            {t.landing.faqTitle}
          </h2>
          <div className="mt-4 divide-y divide-border rounded-lg border border-border">
            {t.landing.faqs.map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="cursor-pointer list-none font-semibold text-brand-navy marker:hidden">
                  <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden="true">
                    ›
                  </span>
                  {f.q}
                </summary>
                <p className="mt-2 pl-5">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-6">
          <div className="rounded-lg bg-brand-navy p-8 text-white">
            <h2 className="text-2xl font-bold">{t.landing.ctaTitle}</h2>
            <p className="mt-2 max-w-2xl text-white/90">{t.landing.ctaBody}</p>
            {appWindow === "closed" && edition?.applicationsCloseAt && (
              <p className="mt-2">{fill(t.apply.closed, { edition: edition.name, date: formatDate(edition.applicationsCloseAt, locale) })}</p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <ApplyButton locale={locale} t={t} appWindow={appWindow} />
              <Link href={`/${locale}/ambassadors/join`} className="text-white underline underline-offset-4">
                {t.landing.ambassadorCta}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={locale} t={t} contactEmail={edition?.contactEmail} />
    </>
  );
}

function ApplyButton({
  locale,
  t,
  appWindow,
}: {
  locale: Locale;
  t: ReturnType<typeof getDictionary>;
  appWindow: "open" | "not_open" | "closed";
}) {
  if (appWindow !== "open") {
    return (
      <span className="inline-block rounded-md bg-white/15 px-5 py-3 font-semibold">
        {appWindow === "closed" ? t.common.applyClosed : t.common.applyOpensSoon}
      </span>
    );
  }
  return (
    <Link
      href={`/${locale}/apply`}
      className="inline-block rounded-md bg-brand-gold px-6 py-3 text-lg font-bold text-brand-navy hover:brightness-95"
    >
      {t.common.apply}
    </Link>
  );
}
