"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PartnerStage, PartnerType, Temperature } from "@/server/db/schema";
import { bulkUpdatePartnerships, scheduleFirstEmails } from "@/server/outreach/actions";
import { STAGE_LABELS, TEMP_CLASS, TYPE_LABELS } from "./labels";

export type PipelineRow = {
  id: string;
  name: string;
  type: PartnerType;
  location: string | null;
  stage: PartnerStage;
  temperature: Temperature;
  ownerEmail: string | null;
  nextStep: string | null;
  needsVerification: boolean;
  doNotContact: boolean;
  hasEmail: boolean;
  pastPartner: boolean;
};

export function PipelineTable({ rows, staff, today }: { rows: PipelineRow[]; staff: { email: string; fullName: string }[]; today: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [owner, setOwner] = useState("");
  const [dueAt, setDueAt] = useState(today);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ids = [...selected];
  const nameOf = (email: string | null) => staff.find((s) => s.email === email)?.fullName ?? email ?? "—";
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-white p-3" aria-label="Bulk actions">
        <span className="pb-2 text-sm font-semibold">{selected.size} selected</span>
        <div>
          <label htmlFor="bulk-owner" className="block text-xs font-semibold">
            Owner
          </label>
          <select id="bulk-owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="h-9 rounded-md border border-input bg-white px-2 text-sm">
            <option value="">(keep)</option>
            <option value="none">Unassigned</option>
            {staff.map((s) => (
              <option key={s.email} value={s.email}>
                {s.fullName}
              </option>
            ))}
          </select>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!ids.length || !owner || pending}
          onClick={() => start(async () => { await bulkUpdatePartnerships({ ids, owner }); setMessage(`Owner updated for ${ids.length}.`); })}
        >
          Set owner
        </Button>
        {(["hot", "warm", "cold"] as const).map((t) => (
          <Button key={t} size="sm" variant="outline" disabled={!ids.length || pending} onClick={() => start(async () => { await bulkUpdatePartnerships({ ids, temperature: t }); setMessage(`Marked ${t}.`); })}>
            {t[0]!.toUpperCase() + t.slice(1)}
          </Button>
        ))}
        <div>
          <label htmlFor="bulk-date" className="block text-xs font-semibold">
            First email on
          </label>
          <Input id="bulk-date" type="date" value={dueAt} min={today} onChange={(e) => setDueAt(e.target.value)} className="h-9 w-40" />
        </div>
        <Button
          size="sm"
          disabled={!ids.length || pending}
          onClick={() =>
            start(async () => {
              const r = await scheduleFirstEmails({ ids, dueAt, owner: owner && owner !== "none" ? owner : undefined });
              setMessage(`Scheduled ${r.scheduled}${r.skipped ? `, skipped ${r.skipped} (already contacted or do-not-contact)` : ""}. They appear in the owner's queue on that date.`);
              setSelected(new Set());
            })
          }
        >
          Schedule first email
        </Button>
        {message && (
          <p role="status" className="w-full text-sm text-green-800">
            {message}
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left">
            <tr>
              <th className="w-10 p-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  className="size-4"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              <th className="p-2">Partner</th>
              <th className="p-2">Stage</th>
              <th className="p-2">Temp.</th>
              <th className="p-2">Owner</th>
              <th className="p-2">Next</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No partners match. Import the partner spreadsheet to get started.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className={`border-b border-border last:border-0 ${r.doNotContact ? "opacity-50" : ""}`}>
                <td className="p-2">
                  <input type="checkbox" aria-label={`Select ${r.name}`} className="size-4" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td className="p-2">
                  <Link href={`/admin/outreach/${r.id}`} className="font-semibold text-brand-navy hover:underline">
                    {r.name}
                  </Link>
                  <div className="flex flex-wrap gap-1 pt-0.5 text-xs text-muted-foreground">
                    <span>{TYPE_LABELS[r.type]}</span>
                    {r.location && <span>· {r.location}</span>}
                    {r.pastPartner && <Badge className="h-5 bg-brand-gold text-brand-navy">Past partner</Badge>}
                    {r.needsVerification && <Badge variant="outline" className="h-5 border-amber-500 text-amber-800">Check before sending</Badge>}
                    {!r.hasEmail && <Badge variant="outline" className="h-5">No email</Badge>}
                  </div>
                </td>
                <td className="p-2 whitespace-nowrap">{STAGE_LABELS[r.stage]}</td>
                <td className="p-2">
                  <span className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${TEMP_CLASS[r.temperature]}`}>{r.temperature}</span>
                </td>
                <td className="p-2 whitespace-nowrap">{nameOf(r.ownerEmail)}</td>
                <td className="p-2 whitespace-nowrap text-xs">{r.nextStep ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
