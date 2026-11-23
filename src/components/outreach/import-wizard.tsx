"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ColumnMapping, SheetPreview } from "@/server/outreach/import";
import { importCommitAction, importPreviewAction } from "@/server/outreach/actions";

const FIELD_LABELS: Record<string, string> = {
  organisation: "Organisation",
  role: "Who to address",
  contactName: "Named contact",
  email: "Email",
  phone: "Phone",
  otherChannel: "Other channel / website",
  location: "Location",
  fit: "Why target them",
  approach: "Suggested way in",
  temperature: "Temperature",
  status: "Status",
  notes: "Notes",
  source: "Source",
  verification: "Verification",
};

export function ImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetPreview[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ColumnMapping>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const form = (extra: Record<string, ColumnMapping> = overrides) => {
    const fd = new FormData();
    fd.set("file", file!);
    fd.set("overrides", JSON.stringify(extra));
    return fd;
  };
  const preview = (extra?: Record<string, ColumnMapping>) =>
    start(async () => {
      setError(null);
      const r = await importPreviewAction(form(extra));
      if (r.ok) setSheets(r.sheets);
      else setError(r.error);
    });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-white p-4">
        <label htmlFor="xlsx" className="font-semibold">
          1. Choose the outreach spreadsheet (.xlsx)
        </label>
        <p className="mb-2 text-sm text-muted-foreground">
          One sheet per partner type (Universities, Districts, Embassies). Re-importing updates existing partners instead of duplicating them.
        </p>
        <input
          id="xlsx"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setSheets(null);
            setResult(null);
            setOverrides({});
          }}
          className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-semibold"
        />
        <Button className="mt-3" disabled={!file || pending} onClick={() => preview()}>
          {pending && !sheets ? "Reading…" : "Preview"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="font-semibold text-destructive">
          {error}
        </p>
      )}

      {sheets && (
        <div className="space-y-4">
          <h2 className="font-semibold">2. Check each sheet</h2>
          {sheets.map((s) => (
            <section key={s.sheet} className="rounded-lg border border-border bg-white p-4">
              <h3 className="font-bold text-brand-navy">
                {s.sheet} {s.type ? `→ ${s.type}` : "(skipped: not a partner sheet)"}
              </h3>
              {s.type && s.headerRow >= 0 && (
                <>
                  <p className="text-sm">
                    {s.partners.length} partners · {s.partners.length - s.existing} new · {s.existing} already in the system · {s.needsVerification} need checking before sending ·{" "}
                    {s.manual} contact-form/phone only (become manual tasks)
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold">Column mapping (header row {s.headerRow + 1})</summary>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.keys(FIELD_LABELS).map((field) => (
                        <label key={field} className="text-sm">
                          <span className="block text-xs font-semibold">{FIELD_LABELS[field]}</span>
                          <select
                            className="h-8 w-full rounded-md border border-input bg-white px-2"
                            value={(overrides[s.sheet] ?? s.mapping)[field as keyof ColumnMapping] ?? ""}
                            onChange={(e) => {
                              const base = { ...(overrides[s.sheet] ?? s.mapping) };
                              if (e.target.value === "") delete base[field as keyof ColumnMapping];
                              else base[field as keyof ColumnMapping] = Number(e.target.value);
                              const next = { ...overrides, [s.sheet]: base };
                              setOverrides(next);
                            }}
                          >
                            <option value="">(not mapped)</option>
                            {s.header.map((h, i) => (
                              <option key={i} value={i}>
                                {h || `Column ${i + 1}`}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="mt-2" disabled={pending} onClick={() => preview(overrides)}>
                      Re-check with this mapping
                    </Button>
                  </details>
                  <div className="mt-3 max-h-64 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white text-left">
                        <tr>
                          <th className="p-1">Organisation</th>
                          <th className="p-1">Contacts</th>
                          <th className="p-1">Temp.</th>
                          <th className="p-1">Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.partners.slice(0, 200).map((p) => (
                          <tr key={p.importKey} className="border-t border-border">
                            <td className="p-1">{p.name}</td>
                            <td className="p-1">{p.contacts.map((c) => c.email).filter(Boolean).join(", ") || "—"}</td>
                            <td className="p-1">{p.temperature}</td>
                            <td className="p-1">
                              {[p.needsVerification && "check before sending", ...p.warnings].filter(Boolean).join("; ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          ))}
          <div className="rounded-lg border border-border bg-white p-4">
            <h2 className="font-semibold">3. Import</h2>
            <Button
              className="mt-2"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await importCommitAction(form());
                  if (r.ok)
                    setResult(
                      `Imported: ${r.summary.created} new partners, ${r.summary.updated} updated, ${r.summary.contactsAdded} contacts added, ${r.summary.manualTasks} manual tasks created (sheets: ${r.summary.sheets.join(", ")}).`,
                    );
                  else setError(r.error);
                })
              }
            >
              {pending ? "Importing…" : "Import into the current edition"}
            </Button>
            {result && (
              <p role="status" className="mt-2 text-sm text-green-800">
                {result}{" "}
                <Link href="/admin/outreach" className="font-semibold underline">
                  Go to the pipeline
                </Link>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
