import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireStaff } from "@/server/auth/session";
import { formatDate } from "@/server/domain/editions";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { addRunOfShowAction, deleteRunOfShowAction } from "@/server/event/actions";
import { listRunOfShow } from "@/server/event/queries";

export const metadata = { title: "Run-of-show" };

export default async function RunOfShowPage() {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Run-of-show" />;
  const items = await listRunOfShow(session, edition.id);
  const dates = [edition.day1Date, edition.day2Date, edition.day3Date];
  return (
    <>
      <PageHeader title="Run-of-show" description="Share it with partners from their partner page (day plan) and print it for the team." actions={<Link href="/admin/event" className="text-sm underline">Event & after</Link>} />
      <Card className="mb-4 print:hidden">
        <CardContent className="py-4">
          <form action={addRunOfShowAction} className="flex flex-wrap items-end gap-2 text-sm">
            <label>
              Day
              <select name="day" className="block h-9 rounded-md border border-input bg-white px-2">
                <option value="1">Day 1</option>
                <option value="2">Day 2</option>
                <option value="3">Day 3</option>
              </select>
            </label>
            <label>
              Start
              <Input name="startsAt" type="time" required className="w-28" />
            </label>
            <label>
              End
              <Input name="endsAt" type="time" className="w-28" />
            </label>
            <label className="min-w-48 flex-1">
              What
              <Input name="title" required />
            </label>
            <label>
              Where
              <Input name="location" className="w-40" />
            </label>
            <label>
              Owner (email)
              <Input name="ownerEmail" className="w-48" />
            </label>
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((d) => (
          <Card key={d}>
            <CardHeader>
              <CardTitle className="text-base">
                Day {d} {dates[d - 1] && <span className="font-normal text-muted-foreground">· {formatDate(dates[d - 1]!)}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {items
                  .filter((i) => i.day === d)
                  .map((i) => (
                    <li key={i.id} className="flex justify-between gap-2">
                      <span>
                        <strong className="tabular-nums">
                          {i.startsAt}
                          {i.endsAt ? `–${i.endsAt}` : ""}
                        </strong>{" "}
                        {i.title}
                        {i.location && <span className="text-muted-foreground"> · {i.location}</span>}
                        {i.ownerEmail && <span className="block text-xs text-muted-foreground">{i.ownerEmail}</span>}
                      </span>
                      <form action={deleteRunOfShowAction} className="print:hidden">
                        <input type="hidden" name="id" value={i.id} />
                        <button type="submit" className="text-xs underline" aria-label={`Remove ${i.title}`}>
                          remove
                        </button>
                      </form>
                    </li>
                  ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
