import Link from "next/link";
import { PipelineTable } from "@/components/outreach/pipeline-table";
import { STAGE_LABELS, TYPE_LABELS } from "@/components/outreach/labels";
import { PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireStaff } from "@/server/auth/session";
import { partnerType, temperature, type PartnerStage, type PartnerType, type Temperature } from "@/server/db/schema";
import { todayIst } from "@/server/domain/sequences";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { listPipeline, listStaffOptions, STAGES } from "@/server/outreach/crm";

export const metadata = { title: "Partner outreach" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function OutreachPage({ searchParams }: PageProps<"/admin/outreach">) {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Partner outreach" description="No current edition." />;
  const sp = await searchParams;
  const filters = {
    editionId: edition.id,
    type: partnerType.enumValues.find((t) => t === sp.type) as PartnerType | undefined,
    temperature: temperature.enumValues.find((t) => t === sp.temp) as Temperature | undefined,
    stage: STAGES.find((s) => s === sp.stage) as PartnerStage | undefined,
    owner: str(sp.owner),
    q: str(sp.q),
    flagged: sp.flagged === "1",
  };
  const [{ rows, stageCounts }, staff] = await Promise.all([listPipeline(session, filters), listStaffOptions(session)]);
  const count = (type: PartnerType, stage: PartnerStage) => stageCounts.find((c) => c.type === type && c.stage === stage)?.n ?? 0;

  return (
    <>
      <PageHeader
        title="Partner outreach"
        description={`${edition.name} · ${rows.length} partners shown`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/admin/outreach/queue">Today&apos;s queue</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/outreach/import">Import spreadsheet</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/outreach/templates">Templates</Link>
            </Button>
          </div>
        }
      />

      <div className="mb-4 overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="p-2 text-left">Pipeline</th>
              {STAGES.map((s) => (
                <th key={s} className="p-2 text-center font-medium">
                  {STAGE_LABELS[s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["university", "district", "embassy"] as const).map((t) => (
              <tr key={t} className="border-b border-border last:border-0">
                <th className="p-2 text-left font-semibold">{TYPE_LABELS[t]}</th>
                {STAGES.map((s) => (
                  <td key={s} className={`p-2 text-center tabular-nums ${s === "confirmed" && count(t, s) > 0 ? "font-bold text-green-800" : ""}`}>
                    {count(t, s) ? (
                      <Link href={`/admin/outreach?type=${t}&stage=${s}`} className="hover:underline">
                        {count(t, s)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">·</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <Input name="q" defaultValue={filters.q} placeholder="Search name or location" className="w-56" aria-label="Search" />
        <select name="type" defaultValue={filters.type ?? ""} aria-label="Type" className="h-9 rounded-md border border-input bg-white px-2 text-sm">
          <option value="">All types</option>
          {partnerType.enumValues.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={filters.stage ?? ""} aria-label="Stage" className="h-9 rounded-md border border-input bg-white px-2 text-sm">
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        <select name="temp" defaultValue={filters.temperature ?? ""} aria-label="Temperature" className="h-9 rounded-md border border-input bg-white px-2 text-sm">
          <option value="">Any temperature</option>
          {temperature.enumValues.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select name="owner" defaultValue={filters.owner ?? ""} aria-label="Owner" className="h-9 rounded-md border border-input bg-white px-2 text-sm">
          <option value="">Any owner</option>
          <option value="none">Unassigned</option>
          {staff.map((s) => (
            <option key={s.email} value={s.email}>
              {s.fullName}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="flagged" value="1" defaultChecked={filters.flagged} className="size-4" /> Needs checking
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      <PipelineTable rows={rows} staff={staff} today={todayIst()} />
    </>
  );
}
