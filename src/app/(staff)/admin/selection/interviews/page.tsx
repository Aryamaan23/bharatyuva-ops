import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireStaff } from "@/server/auth/session";
import { formatDateTime } from "@/server/domain/editions";
import { todayIst } from "@/server/domain/sequences";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { createSlotsAction, deleteSlotAction } from "@/server/selection/actions";
import { listSlots } from "@/server/selection/queries";

export const metadata = { title: "Interview slots" };

export default async function InterviewsPage() {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Interview slots" description="No current edition." />;
  const slots = await listSlots(session, edition.id);
  return (
    <>
      <PageHeader
        title="Interview slots"
        description="Applicants invited to interview pick a slot in their portal and get a confirmation email with the meeting link."
        actions={
          <Link href="/admin/selection" className="text-sm underline">
            Back to selection
          </Link>
        }
      />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Add a block of slots (IST)</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createSlotsAction} className="flex flex-wrap items-end gap-2 text-sm">
            <label>
              Date
              <Input name="date" type="date" required min={todayIst()} className="w-40" />
            </label>
            <label>
              First slot
              <Input name="start" type="time" required defaultValue="10:00" className="w-28" />
            </label>
            <label>
              How many
              <Input name="count" type="number" min={1} max={40} defaultValue={8} className="w-20" />
            </label>
            <label>
              Minutes each
              <Input name="minutes" type="number" min={5} max={120} defaultValue={15} className="w-20" />
            </label>
            <label>
              People per slot
              <Input name="capacity" type="number" min={1} max={10} defaultValue={1} className="w-20" />
            </label>
            <label className="min-w-56 flex-1">
              Meeting link
              <Input name="meetingLink" type="url" placeholder="https://meet.google.com/…" />
            </label>
            <Button type="submit">Add slots</Button>
          </form>
        </CardContent>
      </Card>
      <ul className="space-y-2">
        {slots.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-white p-3 text-sm">
            <span>
              <strong>{formatDateTime(s.startsAt)}</strong> · {s.bookings.length}/{s.capacity} booked
              {s.bookings.length > 0 && <span className="text-muted-foreground"> · {s.bookings.map((b) => b.name).join(", ")}</span>}
            </span>
            {s.bookings.length === 0 && (
              <form action={deleteSlotAction}>
                <input type="hidden" name="id" value={s.id} />
                <Button size="sm" variant="outline">
                  Remove
                </Button>
              </form>
            )}
          </li>
        ))}
        {slots.length === 0 && <li className="text-sm text-muted-foreground">No slots yet.</li>}
      </ul>
    </>
  );
}
