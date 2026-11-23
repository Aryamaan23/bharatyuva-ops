import type { Metadata } from "next";
import { Notice, PageShell } from "@/components/site/page-shell";
import { getDictionary, resolveLocale } from "@/i18n";
import { verifyDataRequest } from "@/server/privileged/data-requests";

export const metadata: Metadata = { robots: { index: false } };

export default async function ConfirmDataRequestPage({ params }: PageProps<"/[locale]/data-request/confirm/[token]">) {
  const locale = await resolveLocale(params.then((p) => ({ locale: p.locale })));
  const { token } = await params;
  const t = getDictionary(locale);
  const ok = token.length >= 20 && token.length <= 100 && (await verifyDataRequest(token));
  return (
    <PageShell locale={locale} t={t} path="/data-request" title={ok ? t.dataRequest.confirmedTitle : t.dataRequest.title}>
      {ok ? <Notice tone="success">{t.dataRequest.confirmedBody}</Notice> : <Notice>{t.dataRequest.invalid}</Notice>}
    </PageShell>
  );
}
