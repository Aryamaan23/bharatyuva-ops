import { redirect } from "next/navigation";
import { EmailSignIn } from "@/components/site/email-sign-in";
import { signInCopy } from "@/components/site/sign-in-copy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { en } from "@/i18n/dictionaries/en";
import { signInWithGoogle } from "@/server/auth/actions";
import { getStaffSession } from "@/server/auth/session";

export const metadata = { title: "Staff sign-in" };

export default async function StaffLoginPage({ searchParams }: PageProps<"/login">) {
  if (await getStaffSession()) redirect("/admin");
  const sp = await searchParams;
  const error =
    sp.auth_error === "oauth_unavailable"
      ? "Google sign-in isn't configured in this environment. Use the email link instead."
      : sp.auth_error
        ? "That sign-in didn't work. Please try again."
        : undefined;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-brand-navy">Bharat Yuva Ops</CardTitle>
          <p className="text-sm text-muted-foreground">Staff, reviewers and volunteers sign in here.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form action={signInWithGoogle}>
            <Button type="submit" variant="outline" size="lg" className="w-full">
              Continue with Google
            </Button>
          </form>
          <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <EmailSignIn
            copy={signInCopy(en, "Email me a link", "We'll send a one-time sign-in link to your staff email.")}
            next="/admin"
            locale="en"
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
            linkError={error}
          />
        </CardContent>
      </Card>
    </main>
  );
}
