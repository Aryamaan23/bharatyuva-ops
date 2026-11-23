"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { suggestLineAction } from "@/server/outreach/actions";

export function PersonalLineField({ partnershipId, initial, aiAvailable }: { partnershipId: string; initial: string; aiAvailable: boolean }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor="personalLine" className="text-sm font-semibold">
          Personal line
        </label>
        {aiAvailable && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await suggestLineAction(partnershipId);
                if (r.ok) setValue(r.text);
                else setError(r.error);
              })
            }
          >
            {pending ? "Thinking…" : "✨ Suggest"}
          </Button>
        )}
      </div>
      <Textarea id="personalLine" name="personalLine" rows={2} value={value} onChange={(e) => setValue(e.target.value)} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
