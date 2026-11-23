import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ADMIN_ROLES, hasRole, requireStaff } from "@/server/auth/session";
import { GMAIL_SCOPES, googleConfigured } from "@/server/gmail/oauth";
import { setDailyCapAction } from "@/server/outreach/actions";
import { gmailStatusFor, listGmailConnections } from "@/server/outreach/crm";

export const metadata = { title: "Gmail" };

const ERRORS: Record<string, string> = {
  not_configured: "Google OAuth isn't configured for this environment.",
  state_mismatch: "The sign-in didn't match your session. Please try again.",
  no_refresh_token: "Google didn't grant offline access. Remove the app at myaccount.google.com/permissions and try again.",
  missing_scopes: "Please tick both Gmail permissions on Google's screen.",
  exchange_failed: "Couldn't complete the connection. Please try again.",
  access_denied: "You declined access on Google's screen.",
};

export default async function GmailSettingsPage({ searchParams }: PageProps<"/admin/settings/gmail">) {
  const session = await requireStaff();
  const sp = await searchParams;
  const [mine, all] = await Promise.all([gmailStatusFor(session), hasRole(session, ...ADMIN_ROLES) ? listGmailConnections(session) : Promise.resolve([])]);
  return (
    <>
      <PageHeader title="Gmail" description="Partner outreach is sent from your own mailbox, so replies land in your inbox." />
      {sp.connected && <p role="status" className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-900">Gmail connected.</p>}
      {typeof sp.error === "string" && <p role="alert" className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[sp.error] ?? sp.error}</p>}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!googleConfigured() ? (
            <p>Google OAuth isn&apos;t configured here. In development, approved emails are delivered to Mailpit instead.</p>
          ) : mine ? (
            <>
              <p>
                {mine.googleEmail} <Badge variant={mine.status === "active" ? "secondary" : "destructive"}>{mine.status}</Badge> · cap {mine.dailyCap}/day
              </p>
              {mine.lastError && <p className="text-destructive">{mine.lastError}</p>}
              {/* A plain GET form: the OAuth redirect needs a full browser navigation. */}
              <form action="/api/gmail/connect" method="get">
                <Button type="submit" variant="outline">
                  Reconnect
                </Button>
              </form>
            </>
          ) : (
            <form action="/api/gmail/connect" method="get">
              <Button type="submit">Connect my Gmail</Button>
            </form>
          )}
          <details>
            <summary className="cursor-pointer font-semibold">What access is requested, and why</summary>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground">
              <li>
                <code>{GMAIL_SCOPES[0]}</code>: send outreach as you.
              </li>
              <li>
                <code>{GMAIL_SCOPES[1]}</code>: read replies on the threads the app started, to stop follow-ups and spot “no” or bounces. Other mail is never read or stored.
              </li>
              <li>
                <code>openid email</code>: confirm which Google account you connected.
              </li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              Google may show “this app isn&apos;t verified”. That&apos;s expected for our small internal app (fewer than 100 users); choose Advanced → Continue.
            </p>
          </details>
        </CardContent>
      </Card>

      {all.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Team connections (admin)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {all.map((c) => (
                <li key={c.staffEmail} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {c.staffEmail} → {c.googleEmail} <Badge variant={c.status === "active" ? "secondary" : "destructive"}>{c.status}</Badge>
                  </span>
                  <form action={setDailyCapAction} className="flex items-center gap-2">
                    <input type="hidden" name="staffEmail" value={c.staffEmail} />
                    <label htmlFor={`cap-${c.staffEmail}`} className="text-xs">
                      Daily cap
                    </label>
                    <Input id={`cap-${c.staffEmail}`} name="cap" type="number" min={1} max={100} defaultValue={c.dailyCap} className="h-8 w-20" />
                    <Button type="submit" size="sm" variant="outline">
                      Save
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
