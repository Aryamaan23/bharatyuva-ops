import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/server/auth/session";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { reviewAmbassadorAction } from "@/server/ambassadors/actions";
import { leaderboard, referralLink } from "@/server/privileged/ambassadors";

export const metadata = { title: "Ambassadors" };

export default async function AmbassadorsPage() {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Ambassadors" description="No current edition." />;
  const board = await leaderboard(edition.id);
  const pending = board.filter((b) => b.status === "pending");
  const approved = board.filter((b) => b.status === "approved");
  return (
    <>
      <PageHeader title="Campus ambassadors" description={`Sign-up page: /en/ambassadors/join · ${approved.length} approved, ${pending.length} waiting. Progress emails go out every Monday.`} />
      {pending.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-semibold text-brand-navy">Waiting for approval</h2>
          <ul className="space-y-2">
            {pending.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-white p-3 text-sm">
                <span>
                  <strong>{a.fullName}</strong> · {a.college} · {a.email}
                </span>
                <span className="flex gap-2">
                  <form action={reviewAmbassadorAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button size="sm" name="decision" value="approve">
                      Approve
                    </Button>
                  </form>
                  <form action={reviewAmbassadorAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button size="sm" variant="outline" name="decision" value="reject">
                      Decline
                    </Button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <h2 className="mb-2 font-semibold text-brand-navy">Leaderboard</h2>
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left">
            <tr>
              <th className="p-2">#</th>
              <th className="p-2">Ambassador</th>
              <th className="p-2">Code</th>
              <th className="p-2 text-right">Submitted</th>
              <th className="p-2 text-right">Started</th>
            </tr>
          </thead>
          <tbody>
            {approved.map((a, i) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="p-2">{i + 1}</td>
                <td className="p-2">
                  {a.fullName} <span className="text-xs text-muted-foreground">· {a.college}</span>
                </td>
                <td className="p-2 font-mono text-xs" title={a.code ? referralLink(a.code) : ""}>
                  {a.code}
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">{a.submitted}</td>
                <td className="p-2 text-right tabular-nums">{a.started}</td>
              </tr>
            ))}
            {approved.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No approved ambassadors yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {board.some((b) => b.status === "rejected") && (
        <p className="mt-3 text-xs text-muted-foreground">
          Declined: {board.filter((b) => b.status === "rejected").length} <Badge variant="outline">hidden</Badge>
        </p>
      )}
    </>
  );
}
