import type { Metadata } from "next";
import Link from "next/link";
import { Notice, PageShell } from "@/components/site/page-shell";
import { fill } from "@/i18n/dictionaries/en";
import { getDictionary, resolveLocale } from "@/i18n";
import { getSessionUser } from "@/server/auth/session";
import { leaderboard, myAmbassador, qrSvg, referralLink } from "@/server/privileged/ambassadors";
import { getCurrentEdition } from "@/server/privileged/editions";

export async function generateMetadata({ params }: PageProps<"/[locale]/ambassador">): Promise<Metadata> {
  const t = getDictionary(await resolveLocale(params));
  return { title: t.ambassador.title, robots: { index: false } };
}

export default async function AmbassadorPage({ params }: PageProps<"/[locale]/ambassador">) {
  const locale = await resolveLocale(params);
  const t = getDictionary(locale);
  const edition = await getCurrentEdition();
  const user = await getSessionUser();
  const me = user && edition ? await myAmbassador(user, edition.id) : null;
  const shell = (body: React.ReactNode) => (
    <PageShell locale={locale} t={t} path="/ambassador" title={t.ambassador.title} contactEmail={edition?.contactEmail}>
      {body}
    </PageShell>
  );
  if (!me || !edition) {
    return shell(
      <Link href={`/${locale}/ambassadors/join`} className="inline-block rounded-md bg-brand-navy px-5 py-3 font-semibold text-white">
        {t.ambassador.joinTitle}
      </Link>,
    );
  }
  if (me.status === "pending") return shell(<Notice><p className="font-semibold">{t.ambassador.pendingTitle}</p><p className="mt-1">{t.ambassador.pendingBody}</p></Notice>);
  if (me.status === "rejected" || !me.code) return shell(<Notice>{t.ambassador.rejected}</Notice>);

  const link = referralLink(me.code);
  const [svg, board] = await Promise.all([qrSvg(link), leaderboard(edition.id)]);
  const approved = board.filter((r) => r.status === "approved");
  const mine = approved.find((r) => r.id === me.id);
  const rank = approved.findIndex((r) => r.id === me.id) + 1;

  return shell(
    <div className="space-y-8">
      <section aria-labelledby="link" className="rounded-lg border border-border p-5">
        <h2 id="link" className="text-lg font-bold text-brand-navy">
          {t.ambassador.linkTitle}
        </h2>
        <p className="mt-1 text-sm">{t.ambassador.linkBody}</p>
        <p className="mt-3 select-all break-all rounded-md bg-muted p-3 font-mono text-sm">{link}</p>
        <div className="mt-4 w-48" role="img" aria-label={t.ambassador.qrAlt} dangerouslySetInnerHTML={{ __html: svg }} />
      </section>
      <section aria-labelledby="stats" className="grid gap-4 sm:grid-cols-2">
        <h2 id="stats" className="sr-only">
          Stats
        </h2>
        <div className="rounded-lg border border-border p-4">
          <p className="text-3xl font-bold text-brand-navy">{mine?.submitted ?? 0}</p>
          <p className="text-sm">{t.ambassador.submitted}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-3xl font-bold text-brand-navy">{mine?.started ?? 0}</p>
          <p className="text-sm">{t.ambassador.started}</p>
        </div>
        {rank > 0 && <p className="font-semibold sm:col-span-2">{fill(t.ambassador.rank, { rank, total: approved.length })}</p>}
      </section>
      <section aria-labelledby="board">
        <h2 id="board" className="text-lg font-bold text-brand-navy">
          {t.ambassador.leaderboardTitle}
        </h2>
        <ol className="mt-2 space-y-1">
          {approved.slice(0, 10).map((r, i) => (
            <li key={r.id} className={`flex justify-between gap-2 rounded px-2 py-1 text-sm ${r.id === me.id ? "bg-brand-gold-soft font-semibold" : ""}`}>
              <span>
                {i + 1}. {r.fullName.split(" ")[0]} · {r.college}
              </span>
              <span className="tabular-nums">{r.submitted}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>,
  );
}
