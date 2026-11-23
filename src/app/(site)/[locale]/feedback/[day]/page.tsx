import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmailSignIn } from "@/components/site/email-sign-in";
import { Notice, PageShell } from "@/components/site/page-shell";
import { signInCopy } from "@/components/site/sign-in-copy";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fill } from "@/i18n/dictionaries/en";
import { getDictionary, resolveLocale } from "@/i18n";
import { submitFeedbackAction } from "@/server/applications/event-actions";
import { getSessionUser } from "@/server/auth/session";

export const metadata: Metadata = { robots: { index: false } };

export default async function FeedbackPage({ params, searchParams }: PageProps<"/[locale]/feedback/[day]">) {
  const locale = await resolveLocale(params.then((p) => ({ locale: p.locale })));
  const { day: dayParam } = await params;
  const day = Number(dayParam);
  if (![1, 2, 3].includes(day)) notFound();
  const t = getDictionary(locale);
  const sp = await searchParams;
  const user = await getSessionUser();
  const title = fill(t.event.feedbackTitle, { day });
  return (
    <PageShell locale={locale} t={t} path={`/feedback/${day}`} title={title}>
      {sp.done ? (
        <Notice tone="success">{t.event.feedbackThanks}</Notice>
      ) : sp.no ? (
        <Notice>{t.event.feedbackNotEligible}</Notice>
      ) : !user ? (
        <EmailSignIn copy={signInCopy(t, title, t.portal.signInBody)} next={`/${locale}/feedback/${day}`} locale={locale} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
      ) : (
        <form action={submitFeedbackAction} className="space-y-5">
          <p>{t.event.feedbackBody}</p>
          <input type="hidden" name="day" value={day} />
          <input type="hidden" name="locale" value={locale} />
          <fieldset>
            <legend className="mb-2 font-semibold">{t.event.ratingLabel}</legend>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((r) => (
                <label key={r} className="cursor-pointer">
                  <input type="radio" name="rating" value={r} required className="peer sr-only" />
                  <span className="inline-flex size-12 items-center justify-center rounded-md border border-input text-lg peer-checked:border-brand-navy peer-checked:bg-brand-navy peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand-gold">
                    {r}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1">
            <label htmlFor="liked" className="font-semibold">
              {t.event.likedLabel}
            </label>
            <Textarea id="liked" name="liked" rows={3} />
          </div>
          <div className="space-y-1">
            <label htmlFor="improve" className="font-semibold">
              {t.event.improveLabel}
            </label>
            <Textarea id="improve" name="improve" rows={3} />
          </div>
          <Button type="submit" size="lg">
            {t.event.feedbackSubmit}
          </Button>
        </form>
      )}
    </PageShell>
  );
}
