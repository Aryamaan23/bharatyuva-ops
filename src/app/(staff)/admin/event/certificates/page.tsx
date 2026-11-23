import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { RunButton } from "@/components/event/run-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ADMIN_ROLES, hasRole, requireStaff } from "@/server/auth/session";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { emailCertificatesAction, issueCertificatesAction, revokeCertificateAction } from "@/server/event/actions";
import { listCertificates } from "@/server/event/queries";

export const metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const session = await requireStaff();
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Certificates" />;
  const certs = await listCertificates(session, edition.id);
  const isAdmin = hasRole(session, ...ADMIN_ROLES);
  return (
    <>
      <PageHeader
        title="Certificates"
        description="Participation for every fellow who checked in on any day; excellence for the winning team; ambassador certificates for the top 3 referrers. Anyone can verify a code at /verify/<code>."
        actions={<Link href="/admin/event" className="text-sm underline">Event & after</Link>}
      />
      {isAdmin && (
        <div className="mb-4 flex flex-wrap gap-4">
          <RunButton action={issueCertificatesAction} label="Issue certificates" />
          <RunButton action={emailCertificatesAction} label="Email download links" variant="outline" />
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left">
            <tr>
              <th className="p-2">Recipient</th>
              <th className="p-2">Type</th>
              <th className="p-2">Code</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {certs.map((c) => (
              <tr key={c.id} className={`border-b border-border last:border-0 ${c.revokedAt ? "opacity-50" : ""}`}>
                <td className="p-2">
                  {c.recipientName} <span className="text-xs text-muted-foreground">· {c.college}</span>
                </td>
                <td className="p-2">
                  {c.kind} {c.revokedAt && <Badge variant="destructive">revoked</Badge>}
                </td>
                <td className="p-2 font-mono text-xs">
                  <a href={`/verify/${c.code}`} className="underline" target="_blank" rel="noopener">
                    {c.code}
                  </a>
                </td>
                <td className="space-x-2 p-2 text-right whitespace-nowrap">
                  <a href={`/certificates/${c.code}.pdf`} className="text-xs underline" target="_blank" rel="noopener">
                    PDF
                  </a>
                  {isAdmin && !c.revokedAt && (
                    <form action={revokeCertificateAction} className="inline">
                      <input type="hidden" name="id" value={c.id} />
                      <Button size="sm" variant="ghost" className="h-7 text-xs">
                        Revoke
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {certs.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  None issued yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
