import type { RubricCriterion } from "@/server/db/schema";

export type ScoreErrors = Record<string, string>;

export function validateScores(criteria: RubricCriterion[], scores: Record<string, number>): ScoreErrors {
  const errors: ScoreErrors = {};
  for (const c of criteria) {
    const v = scores[c.key];
    if (v === undefined || Number.isNaN(v)) errors[c.key] = "Score required";
    else if (!Number.isInteger(v) || v < 0 || v > c.max) errors[c.key] = `Whole number from 0 to ${c.max}`;
  }
  return errors;
}

/** Weighted total as a percentage of the maximum possible (0-100). */
export function weightedTotal(criteria: RubricCriterion[], scores: Record<string, number>): number {
  const possible = criteria.reduce((s, c) => s + c.weight * c.max, 0);
  if (possible === 0) return 0;
  const got = criteria.reduce((s, c) => s + c.weight * (scores[c.key] ?? 0), 0);
  return Math.round((got / possible) * 10000) / 100;
}

export type Aggregate = { mean: number | null; spread: number | null; count: number; disagreement: boolean };

/** Reviewers disagree when their totals differ by more than 30 percentage points. */
export function aggregateTotals(totals: number[], threshold = 30): Aggregate {
  if (totals.length === 0) return { mean: null, spread: null, count: 0, disagreement: false };
  const mean = Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100;
  const spread = Math.round((Math.max(...totals) - Math.min(...totals)) * 100) / 100;
  return { mean, spread, count: totals.length, disagreement: totals.length > 1 && spread > threshold };
}

export const DEFAULT_RUBRIC: RubricCriterion[] = [
  { key: "motivation", label: "Motivation and commitment", weight: 2, max: 5, guidance: "Why this fellowship, why now; specific rather than generic." },
  { key: "problem", label: "Understanding of a public problem", weight: 3, max: 5, guidance: "Grounded in a real place and people; sees causes, not just symptoms." },
  { key: "solution", label: "Quality of the proposed first step", weight: 2, max: 5, guidance: "Practical, testable, aware of constraints." },
  { key: "teamwork", label: "Teamwork and initiative", weight: 1, max: 5, guidance: "Evidence of working with others to get something done." },
  { key: "clarity", label: "Clarity of thought", weight: 1, max: 5, guidance: "Clear writing in Hindi or English; language polish is not scored." },
];
