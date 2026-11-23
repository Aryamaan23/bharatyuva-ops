import { PageHeader } from "@/components/admin/ui";
import { Scanner } from "@/components/event/scanner";
import { requireStaff } from "@/server/auth/session";
import { todayIst } from "@/server/domain/sequences";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { attendance } from "@/server/event/queries";

export const metadata = { title: "Check-in" };

export default async function CheckinPage() {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Check-in" />;
  const fellows = await attendance(session, edition.id);
  const today = todayIst();
  const day = edition.day2Date === today ? 2 : edition.day3Date === today ? 3 : 1;
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Check-in" description={`${fellows.length} confirmed fellows`} />
      <Scanner fellows={fellows.map((f) => ({ id: f.id, name: f.name, college: f.college }))} defaultDay={day} />
    </div>
  );
}
