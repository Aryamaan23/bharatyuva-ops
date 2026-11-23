import type { Metadata } from "next";
import { PageShell } from "@/components/site/page-shell";
import { PRIVACY_UPDATED, PRIVACY_VERSION, privacySections } from "@/content/privacy";
import { fill } from "@/i18n/dictionaries/en";
import { getDictionary, resolveLocale } from "@/i18n";
import { formatDate } from "@/server/domain/editions";

export const dynamic = "force-static";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const t = getDictionary(await resolveLocale(params));
  return { title: t.privacy.title };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const locale = await resolveLocale(params);
  const t = getDictionary(locale);
  return (
    <PageShell locale={locale} t={t} path="/privacy" title={t.privacy.title}>
      <p className="text-sm text-muted-foreground">
        {fill(t.privacy.updated, { version: PRIVACY_VERSION, date: formatDate(PRIVACY_UPDATED, locale) })}
      </p>
      <div className="mt-6 space-y-8">
        {privacySections(locale).map((s) => (
          <section key={s.heading}>
            <h2 className="text-xl font-bold text-brand-navy">{s.heading}</h2>
            <div className="mt-2 space-y-3">
              {s.body.map((p) => (
                <p key={p.slice(0, 40)}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
