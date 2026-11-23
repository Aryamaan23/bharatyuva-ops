import { PageHeader } from "@/components/admin/ui";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { formatDateTime } from "@/server/domain/editions";
import { recentAudit } from "@/server/platform/health";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const session = await requireStaff(ADMIN_ROLES);
  const sp = await searchParams;
  const entity = typeof sp.entity === "string" && /^[a-z_]{1,40}$/.test(sp.entity) ? sp.entity : undefined;
  const rows = await recentAudit(session, entity);
  return (
    <>
      <PageHeader title="Audit log" description="Every send, status change, export, role change and deletion. Entries can't be edited or removed." />
      <form className="mb-4 flex items-end gap-2">
        <div>
          <label htmlFor="entity" className="text-xs font-semibold">
            Entity
          </label>
          <Input id="entity" name="entity" defaultValue={entity} placeholder="application" className="w-48" />
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(r.at)}</TableCell>
                <TableCell>{r.actorEmail ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.action}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.entity}
                  {r.entityId ? `:${r.entityId.slice(0, 8)}` : ""}
                </TableCell>
                <TableCell className="max-w-80 truncate font-mono text-xs">
                  {r.after ? JSON.stringify(r.after).slice(0, 200) : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
