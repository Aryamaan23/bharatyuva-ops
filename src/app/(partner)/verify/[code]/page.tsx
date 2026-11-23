import type { Metadata } from "next";
import { formatDate, formatDayRange } from "@/server/domain/editions";
import { findCertificate } from "@/server/privileged/event";

export const metadata: Metadata = { title: "Verify a Bharat Yuva certificate", robots: { index: false } };
export const dynamic = "force-dynamic";

const KIND = { participation: "Certificate of Participation", winner: "Certificate of Excellence (winning team)", ambassador: "Campus Ambassador Certificate" };

export default async function VerifyPage({ params }: PageProps<"/verify/[code]">) {
  const { code } = await params;
  const row = await findCertificate(code.toUpperCase());
  const valid = row && !row.c.revokedAt;
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <p className="text-sm font-semibold text-muted-foreground">Bharat Yuva · Beyond the Classroom</p>
      <h1 className="mt-1 text-2xl font-bold text-brand-navy">Certificate verification</h1>
      <div className={`mt-6 rounded-lg border-l-4 p-5 ${valid ? "border-green-700 bg-green-50" : "border-destructive bg-destructive/5"}`}>
        {valid ? (
          <>
            <p className="text-lg font-bold text-green-900">✓ Genuine certificate</p>
            <dl className="mt-3 space-y-1 text-sm">
              <div><dt className="inline font-semibold">Awarded to: </dt><dd className="inline">{row.c.recipientName}</dd></div>
              {row.c.college && <div><dt className="inline font-semibold">Institution: </dt><dd className="inline">{row.c.college}</dd></div>}
              <div><dt className="inline font-semibold">Type: </dt><dd className="inline">{KIND[row.c.kind]}</dd></div>
              <div><dt className="inline font-semibold">Programme: </dt><dd className="inline">{row.edition.name}{formatDayRange(row.edition) ? ` (${formatDayRange(row.edition)})` : ""}</dd></div>
              <div><dt className="inline font-semibold">Issued: </dt><dd className="inline">{formatDate(row.c.issuedAt)}</dd></div>
              <div><dt className="inline font-semibold">Code: </dt><dd className="inline font-mono">{row.c.code}</dd></div>
            </dl>
          </>
        ) : (
          <p className="font-semibold">{row?.c.revokedAt ? "This certificate has been revoked." : "No certificate matches this code. Check it was typed exactly as printed."}</p>
        )}
      </div>
    </main>
  );
}
