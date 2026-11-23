import Link from "next/link";
import { PageHeader, Stat } from "@/components/admin/ui";
import { requireStaff } from "@/server/auth/session";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { attendance } from "@/server/event/queries";

export const metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Attendance" />;
  const rows = await attendance(session, edition.id);
  const on = (d: number) => rows.filter((r) => r.days.includes(d)).length;
  return (
    <>
      <PageHeader title="Attendance" description="Emergency contacts are shown here for event staff only." actions={<Link href="/admin/event" className="text-sm underline">Event & after</Link>} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((d) => (
          <Stat key={d} label={`Day ${d}`} value={`${on(d)}/${rows.length}`} />
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left">
            <tr>
              <th className="p-2">Fellow</th>
              <th className="p-2">D1</th>
              <th className="p-2">D2</th>
              <th className="p-2">D3</th>
              <th className="p-2">Phone</th>
              <th className="p-2">Emergency contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="p-2">
                  {r.name} <span className="text-xs text-muted-foreground">· {r.college}</span>
                </td>
                {[1, 2, 3].map((d) => (
                  <td key={d} className="p-2" aria-label={r.days.includes(d) ? "present" : "absent"}>
                    {r.days.includes(d) ? "✓" : "·"}
                  </td>
                ))}
                <td className="p-2 whitespace-nowrap">{r.phone ?? "—"}</td>
                <td className="p-2 text-xs">{r.emergency ? `${r.emergency.name} (${r.emergency.relation}) ${r.emergency.phone}` : <span className="text-destructive">missing</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
