import Link from "next/link";
import { Notice, PageShell } from "@/components/site/page-shell";
import { getDictionary, resolveLocale } from "@/i18n";

export default async function SubmittedPage({ params }: PageProps<"/[locale]/apply/submitted">) {
  const locale = await resolveLocale(params);
  const t = getDictionary(locale);
  return (
    <PageShell locale={locale} t={t} path="/apply/submitted" title={t.apply.submittedTitle}>
      <Notice tone="success">
        <p>{t.apply.submittedBody}</p>
      </Notice>
      <Link href={`/${locale}/me`} className="mt-6 inline-block rounded-md bg-brand-navy px-5 py-3 font-semibold text-white">
        {t.apply.goToPortal}
      </Link>
    </PageShell>
  );
}
