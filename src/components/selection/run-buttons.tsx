"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { assignReviewersAction, generateSummariesAction } from "@/server/selection/actions";

export function SelectionRunButtons() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={pending} onClick={() => start(async () => setMsg((await assignReviewersAction()).message))}>
        Assign reviewers (2 each)
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => setMsg((await generateSummariesAction()).message))}>
        Generate AI summaries
      </Button>
      {msg && (
        <span role="status" className="text-sm">
          {msg}
        </span>
      )}
    </div>
  );
}
