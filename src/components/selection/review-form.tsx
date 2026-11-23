"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RubricCriterion } from "@/server/db/schema";
import { submitReviewAction } from "@/server/selection/actions";

export function ReviewForm({ assignmentId, rubric, initialScores, initialComment, nextHref }: { assignmentId: string; rubric: RubricCriterion[]; initialScores: Record<string, number>; initialComment: string; nextHref: string | null }) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, number>>(initialScores);
  const [comment, setComment] = useState(initialComment);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await submitReviewAction({ assignmentId, scores, comment });
          if (r.ok) {
            setSaved(true);
            setErrors({});
            if (nextHref) router.push(nextHref as never);
            else router.refresh();
          } else setErrors(r.errors);
        });
      }}
    >
      {rubric.map((c) => (
        <fieldset key={c.key} className="space-y-1" aria-describedby={errors[c.key] ? `${c.key}-err` : undefined}>
          <legend className="font-semibold">
            {c.label} <span className="text-xs font-normal text-muted-foreground">(weight ×{c.weight})</span>
          </legend>
          {c.guidance && <p className="text-xs text-muted-foreground">{c.guidance}</p>}
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: c.max + 1 }, (_, v) => (
              <label key={v} className="cursor-pointer">
                <input type="radio" name={c.key} value={v} checked={scores[c.key] === v} onChange={() => setScores((s) => ({ ...s, [c.key]: v }))} className="peer sr-only" />
                <span className="inline-flex size-10 items-center justify-center rounded-md border border-input text-sm peer-checked:border-brand-navy peer-checked:bg-brand-navy peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand-gold">
                  {v}
                </span>
              </label>
            ))}
          </div>
          {errors[c.key] && (
            <p id={`${c.key}-err`} className="text-xs font-semibold text-destructive">
              {errors[c.key]}
            </p>
          )}
        </fieldset>
      ))}
      <div className="space-y-1">
        <label htmlFor="comment" className="font-semibold">
          Comment for the selection team (optional)
        </label>
        <Textarea id="comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      {errors.form && <p role="alert" className="font-semibold text-destructive">{errors.form}</p>}
      {saved && <p role="status" className="text-green-800">Saved.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : nextHref ? "Save and next" : "Save review"}
      </Button>
    </form>
  );
}
