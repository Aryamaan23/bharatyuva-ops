import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { formatDayRange } from "@/server/domain/editions";
import { makeEditionCurrent } from "@/server/editions/actions";
import { listEditions } from "@/server/editions/admin";

export const metadata = { title: "Editions" };

export default async function EditionsPage() {
  const session = await requireStaff(ADMIN_ROLES);
  const editions = await listEditions(session);
  return (
    <>
      <PageHeader
        title="Editions"
        description="Each yearly edition has its own dates, form and pipeline. The current edition powers the public site."
        actions={
          <Button asChild>
            <Link href="/admin/editions/new">New edition</Link>
          </Button>
        }
      />
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Edition</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {editions.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Link href={`/admin/editions/${e.id}`} className="font-semibold text-brand-navy hover:underline">
                    {e.name}
                  </Link>{" "}
                  {e.isCurrent && <Badge className="ml-1 bg-brand-gold text-brand-navy">current</Badge>}
                </TableCell>
                <TableCell>{e.status}</TableCell>
                <TableCell>{formatDayRange(e) ?? "—"}</TableCell>
                <TableCell className="space-x-3 text-right whitespace-nowrap">
                  <Link href={`/admin/editions/${e.id}/form`} className="text-sm underline">
                    Application form
                  </Link>
                  {!e.isCurrent && (
                    <form action={makeEditionCurrent} className="inline">
                      <input type="hidden" name="id" value={e.id} />
                      <Button size="sm" variant="outline">
                        Make current
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {editions.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No editions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
