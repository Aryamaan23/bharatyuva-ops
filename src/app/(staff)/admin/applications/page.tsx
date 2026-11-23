import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { APPLICATION_STATUSES, listApplications } from "@/server/applications/staff";
import { ADMIN_ROLES, hasRole, requireStaff } from "@/server/auth/session";
import type { ApplicationStatus } from "@/server/db/schema";
import { formatDate } from "@/server/domain/editions";
import { getCurrentEditionForStaff } from "@/server/editions/admin";

export const metadata = { title: "Applications" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export default async function ApplicationsPage({ searchParams }: PageProps<"/admin/applications">) {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Applications" description="No current edition." />;
  const sp = await searchParams;
  const status = APPLICATION_STATUSES.find((s) => s === sp.status) as ApplicationStatus | undefined;
  const filters = {
    editionId: edition.id,
    status,
    state: str(sp.state),
    source: str(sp.source),
    q: str(sp.q),
    duplicatesOnly: sp.duplicates === "1",
    page: Number(str(sp.page) ?? 1) || 1,
  };
  const { rows, total, page, pageSize } = await listApplications(session, filters);
  const qs = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { status, state: filters.state, source: filters.source, q: filters.q, duplicates: sp.duplicates as string | undefined, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Applications"
        description={`${edition.name} · ${total} matching`}
        actions={
          hasRole(session, ...ADMIN_ROLES) ? (
            <Button asChild variant="outline">
              <a href={`/admin/applications/export?edition=${edition.id}`}>Export CSV (logged)</a>
            </Button>
          ) : undefined
        }
      />
      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <div>
          <label htmlFor="q" className="text-xs font-semibold">
            Search
          </label>
          <Input id="q" name="q" defaultValue={filters.q} placeholder="Name, email, college" className="w-56" />
        </div>
        <div>
          <label htmlFor="status" className="text-xs font-semibold">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="block h-9 rounded-md border border-input bg-white px-2 text-sm">
            <option value="">Any</option>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="state" className="text-xs font-semibold">
            State
          </label>
          <Input id="state" name="state" defaultValue={filters.state} className="w-40" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="duplicates" value="1" defaultChecked={filters.duplicatesOnly} className="size-4" /> Possible duplicates
        </label>
        <Button type="submit">Filter</Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>State</TableHead>
              <TableHead>College</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No applications match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/admin/applications/${r.id}`} className="font-semibold text-brand-navy underline-offset-4 hover:underline">
                    {r.name ?? r.email}
                  </Link>
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </TableCell>
                <TableCell className="space-x-1">
                  <Badge variant="secondary">{r.status.replace("_", " ")}</Badge>
                  {r.duplicateOf && <Badge variant="destructive">duplicate?</Badge>}
                  {r.guardianRequired && !r.guardianConfirmedAt && <Badge variant="outline">awaiting guardian</Badge>}
                </TableCell>
                <TableCell>{r.state ?? "—"}</TableCell>
                <TableCell className="max-w-48 truncate">{r.college ?? "—"}</TableCell>
                <TableCell>{r.source ?? (r.referralCode ? `ref ${r.referralCode}` : "direct")}</TableCell>
                <TableCell className="whitespace-nowrap">{r.submittedAt ? formatDate(r.submittedAt) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <nav aria-label="Pagination" className="mt-4 flex items-center gap-3 text-sm">
        {page > 1 && (
          <Link href={`/admin/applications${qs({ page: String(page - 1) })}` as never} className="underline">
            Previous
          </Link>
        )}
        <span>
          Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        {page * pageSize < total && (
          <Link href={`/admin/applications${qs({ page: String(page + 1) })}` as never} className="underline">
            Next
          </Link>
        )}
      </nav>
    </>
  );
}
