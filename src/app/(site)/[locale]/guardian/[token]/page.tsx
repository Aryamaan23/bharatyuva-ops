import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageShell } from "@/components/site/page-shell";
import { Button } from "@/components/ui/button";
import { fill } from "@/i18n/dictionaries/en";
import { getDictionary, resolveLocale } from "@/i18n";
import { confirmGuardianAction } from "@/server/applications/actions";
import { findGuardianRequest } from "@/server/privileged/applications";

export const metadata: Metadata = { robots: { index: false } };

export default async function GuardianPage({ params, searchParams }: PageProps<"/[locale]/guardian/[token]">) {
  const locale = await resolveLocale(params.then((p) => ({ locale: p.locale })));
  const { token } = await params;
  const sp = await searchParams;
  const t = getDictionary(locale);
  const request = token.length >= 20 && token.length <= 100 ? await findGuardianRequest(token) : null;

  const body = (() => {
    if (sp.done) return <Notice tone="success">{t.guardian.done}</Notice>;
    if (!request || request.guardian.confirmedAt || sp.invalid) {
      return request?.guardian.confirmedAt ? <Notice tone="success">{t.guardian.done}</Notice> : <Notice>{t.guardian.invalid}</Notice>;
    }
    const vars = { applicant: request.applicantName ?? "", edition: request.editionName };
    return (
      <div className="space-y-5">
        <p>{fill(t.guardian.intro, vars)}</p>
        <p>{fill(t.guardian.explain, vars)}</p>
        <p>
          <Link href={`/${locale}/privacy`} target="_blank" className="font-semibold text-brand-navy underline">
            {t.apply.readPrivacy}
          </Link>
        </p>
        <form action={confirmGuardianAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="locale" value={locale} />
          <div className="flex items-start gap-3">
            <input id="consent" name="consent" type="checkbox" required className="mt-1 size-5 shrink-0 accent-brand-navy" />
            <label htmlFor="consent">{fill(t.guardian.consentLabel, vars)}</label>
          </div>
          <Button type="submit" size="lg">
            {t.guardian.confirm}
          </Button>
        </form>
      </div>
    );
  })();

  return (
    <PageShell locale={locale} t={t} path={`/guardian/${token}`} title={t.guardian.title}>
      {body}
    </PageShell>
  );
}
