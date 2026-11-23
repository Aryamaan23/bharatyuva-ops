import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { RunButton } from "@/components/event/run-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ADMIN_ROLES, hasRole, requireStaff } from "@/server/auth/session";
import { formatDayRange } from "@/server/domain/editions";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { startNextEditionAction, thankYouAllAction } from "@/server/event/actions";

export const metadata = { title: "Event & after" };

const LINKS = [
  { href: "/admin/event/teams", title: "Teams", body: "Form balanced teams, adjust, mark the winner." },
  { href: "/admin/event/run-of-show", title: "Run-of-show", body: "Timings, owners and locations for each day." },
  { href: "/admin/event/checkin", title: "Check-in", body: "Scan passes on a phone; works offline." },
  { href: "/admin/event/attendance", title: "Attendance", body: "Who came each day, and emergency contacts." },
  { href: "/admin/event/feedback", title: "Feedback", body: "Daily ratings and comments from fellows." },
  { href: "/admin/event/certificates", title: "Certificates", body: "Issue, email and verify certificates." },
  { href: "/admin/event/submissions", title: "Submissions", body: "Practicum submissions from each team." },
  { href: "/admin/event/compendium", title: "Compendium", body: "Cover, contents and team entries in one PDF." },
  { href: "/admin/event/impact", title: "Impact report", body: "The edition in numbers, as PDF and CSV." },
] as const;

export default async function EventHubPage() {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Event & after" description="No current edition." />;
  const isAdmin = hasRole(session, ...ADMIN_ROLES);
  return (
    <>
      <PageHeader title="Event & after" description={`${edition.name}${formatDayRange(edition) ? ` · ${formatDayRange(edition)}` : ""}`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-lg border border-border bg-white p-4 hover:border-brand-navy">
            <p className="font-bold text-brand-navy">{l.title}</p>
            <p className="text-sm text-muted-foreground">{l.body}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thank our partners</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Sends each confirmed partner the thank-you template from their owner&apos;s Gmail, with the photo album link set on the partner page. Each partner is thanked once.
            </p>
            <RunButton action={thankYouAllAction} label="Queue thank-you notes" />
          </CardContent>
        </Card>
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Start the next edition</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={startNextEditionAction} className="space-y-2 text-sm">
                <input type="hidden" name="fromId" value={edition.id} />
                <p className="text-muted-foreground">Copies settings, form, rubric and timeline, and puts every partner (except do-not-contact) back in the pipeline. Past partners are flagged Hot.</p>
                <div className="flex flex-wrap gap-2">
                  <Input name="name" placeholder="Bharat Yuva 3.0" required aria-label="Name" className="w-48" />
                  <Input name="slug" placeholder="bharat-yuva-3" required pattern="[a-z0-9-]{3,40}" aria-label="Slug" className="w-40" />
                  <Button type="submit">Create</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
