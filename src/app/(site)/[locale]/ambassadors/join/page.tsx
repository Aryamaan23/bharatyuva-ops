import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmailSignIn } from "@/components/site/email-sign-in";
import { Notice, PageShell } from "@/components/site/page-shell";
import { signInCopy } from "@/components/site/sign-in-copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getDictionary, resolveLocale } from "@/i18n";
import { ambassadorSignupAction } from "@/server/ambassadors/actions";
import { getSessionUser } from "@/server/auth/session";
import { myAmbassador } from "@/server/privileged/ambassadors";
import { getCurrentEdition } from "@/server/privileged/editions";

export async function generateMetadata({ params }: PageProps<"/[locale]/ambassadors/join">): Promise<Metadata> {
  const t = getDictionary(await resolveLocale(params));
  return { title: t.ambassador.joinTitle };
}

export default async function AmbassadorJoinPage({ params, searchParams }: PageProps<"/[locale]/ambassadors/join">) {
  const locale = await resolveLocale(params);
  const t = getDictionary(locale);
  const sp = await searchParams;
  const edition = await getCurrentEdition();
  const user = await getSessionUser();
  if (user && edition && (await myAmbassador(user, edition.id))) redirect(`/${locale}/ambassador` as never);

  return (
    <PageShell locale={locale} t={t} path="/ambassadors/join" title={t.ambassador.joinTitle} contactEmail={edition?.contactEmail}>
      <p className="mb-6">{t.ambassador.joinBody}</p>
      {!edition ? (
        <Notice>{t.apply.noEdition}</Notice>
      ) : !user ? (
        <EmailSignIn copy={signInCopy(t, t.ambassador.joinTitle, t.ambassador.signInBody)} next={`/${locale}/ambassadors/join`} locale={locale} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
      ) : (
        <form action={ambassadorSignupAction} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          {sp.error && (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {t.ambassador.error}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="fullName">{t.ambassador.name}</Label>
            <Input id="fullName" name="fullName" required autoComplete="name" className="text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="college">{t.ambassador.college}</Label>
            <Input id="college" name="college" required className="text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">{t.ambassador.phone}</Label>
            <Input id="phone" name="phone" type="tel" autoComplete="tel" className="text-base" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="motivation">{t.ambassador.motivation}</Label>
            <Textarea id="motivation" name="motivation" rows={3} />
          </div>
          <Button type="submit" size="lg">
            {t.ambassador.submit}
          </Button>
        </form>
      )}
    </PageShell>
  );
}
