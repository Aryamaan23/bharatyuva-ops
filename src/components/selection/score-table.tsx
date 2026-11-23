"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ScoreRow } from "@/server/selection/queries";
import { draftDecisionAction } from "@/server/selection/actions";

const ACTIONS = [
  { key: "shortlisted", label: "Shortlist" },
  { key: "interview", label: "Invite to interview" },
  { key: "selected", label: "Select (seat offer)" },
  { key: "waitlisted", label: "Waitlist" },
  { key: "rejected", label: "Not selected" },
] as const;

export function ScoreTable({ rows, canDecide }: { rows: ScoreRow[]; canDecide: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [topN, setTopN] = useState(10);
  const [pending, start] = useTransition();
  const set = useMemo(() => new Set(selected), [selected]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div>
      {canDecide && (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3">
          <span className="text-sm font-semibold">{selected.length} selected</span>
          <label className="flex items-center gap-1 text-sm">
            Top
            <input type="number" min={1} max={rows.length} value={topN} onChange={(e) => setTopN(Number(e.target.value))} className="h-8 w-16 rounded-md border border-input px-2" aria-label="How many top-scored to select" />
          </label>
          <Button size="sm" variant="outline" onClick={() => setSelected(rows.filter((r) => r.mean !== null).slice(0, topN).map((r) => r.id))}>
            Select top by score
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
          <span className="mx-2 h-6 w-px bg-border" aria-hidden="true" />
          {ACTIONS.map((a) => (
            <Button key={a.key} size="sm" disabled={!selected.length || pending} onClick={() => start(() => draftDecisionAction({ action: a.key, ids: selected }))}>
              {a.label}…
            </Button>
          ))}
          <p className="w-full text-xs text-muted-foreground">Choosing an action opens a preview of the emails. Nothing is sent until you confirm.</p>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left">
            <tr>
              {canDecide && <th className="w-10 p-2" />}
              <th className="p-2">Applicant</th>
              <th className="p-2">Status</th>
              <th className="p-2 text-right">Mean</th>
              <th className="p-2">Reviews</th>
              <th className="p-2">State · College</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                {canDecide && (
                  <td className="p-2">
                    <input type="checkbox" className="size-4" checked={set.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name ?? r.id}`} />
                  </td>
                )}
                <td className="p-2">
                  <Link href={`/admin/applications/${r.id}`} className="font-semibold text-brand-navy hover:underline">
                    {r.name ?? `#${r.id.slice(0, 6)}`}
                  </Link>
                  <div className="flex gap-1 pt-0.5">
                    {r.disagreement && <Badge variant="destructive" className="h-5">reviewers disagree ({r.spread} pts)</Badge>}
                    {r.duplicate && <Badge variant="outline" className="h-5">duplicate?</Badge>}
                    {!r.hasSummary && <Badge variant="outline" className="h-5">no AI summary</Badge>}
                  </div>
                </td>
                <td className="p-2 whitespace-nowrap">
                  {r.status.replace("_", " ")}
                  {r.waitlistRank && ` #${r.waitlistRank}`}
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">{r.mean === null ? "—" : `${r.mean}%`}</td>
                <td className="p-2 text-xs">
                  {r.reviewers.length === 0
                    ? "unassigned"
                    : r.reviewers.map((rv) => (
                        <span key={rv.email} className="mr-2 whitespace-nowrap">
                          {rv.email.split("@")[0]}: {rv.total === null ? "…" : rv.total}
                        </span>
                      ))}
                </td>
                <td className="max-w-56 truncate p-2 text-xs">
                  {r.state ?? "—"} · {r.college ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
