import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireStaff } from "@/server/auth/session";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { formTeamsAction, moveMemberAction, updateTeamAction } from "@/server/event/actions";
import { fellowsWithTeams } from "@/server/event/queries";

export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Teams" />;
  const { fellows, teams } = await fellowsWithTeams(session, edition.id);
  const unassigned = fellows.filter((f) => !f.teamId);
  return (
    <>
      <PageHeader title="Teams" description={`${fellows.length} confirmed fellows · ${teams.length} teams`} actions={<Link href="/admin/event" className="text-sm underline">Event & after</Link>} />
      <Card className="mb-4">
        <CardContent className="py-4">
          <form action={formTeamsAction} className="flex flex-wrap items-end gap-2 text-sm">
            <label>
              Target team size
              <Input name="size" type="number" min={2} max={20} defaultValue={6} className="w-24" />
            </label>
            <Button type="submit" variant={teams.length ? "outline" : "default"}>
              {teams.length ? "Re-form all teams" : "Form teams"}
            </Button>
            <p className="text-muted-foreground">Balanced by discipline, then state, then gender. Re-forming replaces existing teams.</p>
          </form>
        </CardContent>
      </Card>
      {unassigned.length > 0 && teams.length > 0 && (
        <p className="mb-3 text-sm">
          <Badge variant="destructive">{unassigned.length} without a team</Badge> {unassigned.map((u) => u.name).join(", ")}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((t) => {
          const members = fellows.filter((f) => f.teamId === t.id);
          return (
            <Card key={t.id} className={t.isWinner ? "border-2 border-brand-gold" : ""}>
              <CardHeader>
                <form action={updateTeamAction} className="space-y-2">
                  <input type="hidden" name="id" value={t.id} />
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Input name="name" defaultValue={t.name} aria-label="Team name" className="h-8" />
                    {t.isWinner && <Badge className="bg-brand-gold text-brand-navy">Winner</Badge>}
                  </CardTitle>
                  <Input name="mentor" defaultValue={t.mentor ?? ""} placeholder="Mentor" aria-label="Mentor" className="h-8 text-sm" />
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="isWinner" defaultChecked={t.isWinner} className="size-4" /> Winning team
                    </label>
                    <Button size="sm" variant="outline" type="submit">
                      Save
                    </Button>
                  </div>
                </form>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {members.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {m.name} <span className="text-xs text-muted-foreground">· {m.discipline ?? "—"} · {m.state ?? "—"}</span>
                      </span>
                      <form action={moveMemberAction} className="flex items-center gap-1">
                        <input type="hidden" name="applicationId" value={m.id} />
                        <select name="teamId" defaultValue={t.id} aria-label={`Move ${m.name}`} className="h-7 rounded border border-input bg-white px-1 text-xs">
                          {teams.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" variant="ghost" type="submit" className="h-7 px-2 text-xs">
                          Move
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
