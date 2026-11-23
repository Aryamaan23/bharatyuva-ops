import type { Metadata } from "next";
import { DataRequestForm } from "@/components/site/data-request-form";
import { Notice, PageShell } from "@/components/site/page-shell";
import { getDictionary, resolveLocale } from "@/i18n";

export async function generateMetadata({ params }: PageProps<"/[locale]/data-request">): Promise<Metadata> {
  const t = getDictionary(await resolveLocale(params));
  return { title: t.dataRequest.title };
}

export default async function DataRequestPage({ params, searchParams }: PageProps<"/[locale]/data-request">) {
  const locale = await resolveLocale(params);
  const t = getDictionary(locale);
  const sp = await searchParams;
  return (
    <PageShell locale={locale} t={t} path="/data-request" title={t.dataRequest.title}>
      {sp.sent ? (
        <Notice tone="success">
          <p className="font-semibold">{t.dataRequest.sentTitle}</p>
          <p className="mt-1">{t.dataRequest.sentBody}</p>
        </Notice>
      ) : (
        <>
          <p className="mb-6">{t.dataRequest.body}</p>
          <DataRequestForm
            locale={locale}
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            copy={{
              kindLabel: t.dataRequest.kindLabel,
              kindDelete: t.dataRequest.kindDelete,
              kindAccess: t.dataRequest.kindAccess,
              emailLabel: t.dataRequest.emailLabel,
              reasonLabel: t.dataRequest.reasonLabel,
              submit: t.dataRequest.submit,
              errors: {
                invalid: t.apply.errors.invalid_email,
                captcha: t.apply.errors.captcha,
                rateLimited: t.apply.errors.rateLimited,
              },
            }}
          />
        </>
      )}
    </PageShell>
  );
}
