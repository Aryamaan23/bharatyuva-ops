import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireStaff } from "@/server/auth/session";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { listSubmissions } from "@/server/event/queries";

export const metadata = { title: "Compendium" };

export default async function CompendiumPage() {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Compendium" />;
  const subs = await listSubmissions(session, edition.id);
  const teamsWithEntries = new Set(subs.map((s) => s.s.teamId)).size;
  return (
    <>
      <PageHeader title="Compendium builder" description={`${teamsWithEntries} team entries ready. Order follows team numbers; each entry gets a divider page.`} actions={<Link href="/admin/event" className="text-sm underline">Event & after</Link>} />
      <Card>
        <CardContent className="py-4">
          <form action="/admin/event/compendium/pdf" method="get" target="_blank" className="space-y-3">
            <label className="block text-sm font-semibold">
              Title
              <Input name="title" defaultValue={`${edition.name}: Policy Compendium`} />
            </label>
            <label className="block text-sm font-semibold">
              Introduction (shown above the contents)
              <Textarea name="intro" rows={5} defaultValue={`Recommendations from the fellows of ${edition.name}, developed over three days of learning, field immersion and presentation.`} />
            </label>
            <Button type="submit">Generate PDF</Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
