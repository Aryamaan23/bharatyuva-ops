import { PageHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { formatDateTime } from "@/server/domain/editions";
import { processDataRequest } from "@/server/privacy/admin-actions";
import { listDataRequests } from "@/server/privileged/data-requests";

export const metadata = { title: "Data requests" };

export default async function DataRequestsPage() {
  await requireStaff(ADMIN_ROLES);
  const requests = await listDataRequests();
  return (
    <>
      <PageHeader
        title="Data requests"
        description="Access and deletion requests under the DPDP Act. Respond within 30 days. Only verified requests (the person clicked the email link) can be processed."
      />
      <div className="space-y-3">
        {requests.length === 0 && <p className="text-muted-foreground">No requests.</p>}
        {requests.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-3 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.kind === "delete" ? "destructive" : "secondary"}>{r.kind}</Badge>
                <Badge variant="outline">{r.status.replace("_", " ")}</Badge>
                <span className="font-semibold">{r.email ?? "(address erased)"}</span>
                <span className="text-muted-foreground">requested {formatDateTime(r.createdAt)}</span>
              </div>
              {r.reason && <p>&ldquo;{r.reason}&rdquo;</p>}
              {r.processedAt && (
                <p className="text-muted-foreground">
                  Processed by {r.processedBy} on {formatDateTime(r.processedAt)}
                  {r.notes ? `: ${r.notes}` : ""}
                </p>
              )}
              {r.status === "verified" && (
                <div className="flex flex-wrap items-end gap-3">
                  {r.kind === "delete" ? (
                    <form action={processDataRequest} className="flex items-end gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="op" value="delete" />
                      <div>
                        <label htmlFor={`c-${r.id}`} className="text-xs font-semibold">
                          Type DELETE to erase everything
                        </label>
                        <Input id={`c-${r.id}`} name="confirm" className="w-32" autoComplete="off" />
                      </div>
                      <Button variant="destructive">Erase data</Button>
                    </form>
                  ) : (
                    <>
                      <Button asChild variant="outline">
                        <a href={`/admin/data-requests/${r.id}/export`}>Download export (logged)</a>
                      </Button>
                      <form action={processDataRequest}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="op" value="access_done" />
                        <Button>Mark as sent</Button>
                      </form>
                    </>
                  )}
                  <form action={processDataRequest} className="flex items-end gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="op" value="reject" />
                    <div>
                      <label htmlFor={`n-${r.id}`} className="text-xs font-semibold">
                        Reason (if rejecting)
                      </label>
                      <Input id={`n-${r.id}`} name="notes" className="w-56" />
                    </div>
                    <Button variant="outline">Reject</Button>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
