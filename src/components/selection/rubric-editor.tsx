"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RubricCriterion } from "@/server/db/schema";
import { saveRubricAction } from "@/server/selection/actions";

export function RubricEditor({ initial }: { initial: RubricCriterion[] }) {
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const update = (i: number, patch: Partial<RubricCriterion>) => setRows((r) => r.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-3">
      {rows.map((c, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-border bg-white p-3 md:grid-cols-12">
          <Input aria-label="Key" value={c.key} onChange={(e) => update(i, { key: e.target.value })} className="font-mono text-sm md:col-span-2" />
          <Input aria-label="Label" value={c.label} onChange={(e) => update(i, { label: e.target.value })} className="md:col-span-4" />
          <label className="flex items-center gap-1 text-sm md:col-span-2">
            Weight
            <Input type="number" min={1} max={10} value={c.weight} onChange={(e) => update(i, { weight: Number(e.target.value) })} className="h-8" />
          </label>
          <label className="flex items-center gap-1 text-sm md:col-span-2">
            Max
            <Input type="number" min={1} max={10} value={c.max} onChange={(e) => update(i, { max: Number(e.target.value) })} className="h-8" />
          </label>
          <Button type="button" variant="destructive" size="sm" className="md:col-span-2" disabled={rows.length === 1} onClick={() => setRows((r) => r.filter((_, j) => j !== i))}>
            Remove
          </Button>
          <Input aria-label="Guidance for reviewers" placeholder="Guidance for reviewers" value={c.guidance ?? ""} onChange={(e) => update(i, { guidance: e.target.value })} className="md:col-span-12" />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => setRows((r) => [...r, { key: `criterion_${r.length + 1}`, label: "New criterion", weight: 1, max: 5 }])}>
          Add criterion
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveRubricAction(rows);
              setMsg(r.ok ? { ok: true, text: "Saved. New reviews use this rubric." } : { ok: false, text: r.error ?? "Couldn't save." });
            })
          }
        >
          Save rubric
        </Button>
        {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-green-800" : "text-sm text-destructive"}>{msg.text}</span>}
      </div>
    </div>
  );
}
