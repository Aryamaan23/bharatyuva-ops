/**
 * Give each application `perApp` distinct reviewers, keeping workloads as even as possible and
 * avoiding the same reviewer pair over and over (so no two people jointly decide a whole batch).
 */
export type ReviewerLoad = { email: string; load: number };
export type Assignment = { applicationId: string; reviewerEmail: string };

export function assignReviewers(
  applicationIds: string[],
  reviewers: ReviewerLoad[],
  existing: Map<string, Set<string>>,
  perApp = 2,
  rand: () => number = Math.random,
): Assignment[] {
  if (reviewers.length === 0) return [];
  const load = new Map(reviewers.map((r) => [r.email, r.load]));
  const pairCount = new Map<string, number>();
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  for (const set of existing.values()) {
    const list = [...set];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const k = pairKey(list[i]!, list[j]!);
      pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
    }
  }
  const out: Assignment[] = [];
  for (const appId of applicationIds) {
    const have = new Set(existing.get(appId) ?? []);
    while (have.size < Math.min(perApp, reviewers.length)) {
      const candidates = reviewers
        .filter((r) => !have.has(r.email))
        .map((r) => ({
          email: r.email,
          load: load.get(r.email)!,
          pairs: [...have].reduce((sum, other) => sum + (pairCount.get(pairKey(r.email, other)) ?? 0), 0),
          tiebreak: rand(),
        }))
        .sort((a, b) => a.load - b.load || a.pairs - b.pairs || a.tiebreak - b.tiebreak);
      const pick = candidates[0]!;
      for (const other of have) pairCount.set(pairKey(pick.email, other), (pairCount.get(pairKey(pick.email, other)) ?? 0) + 1);
      have.add(pick.email);
      load.set(pick.email, pick.load + 1);
      out.push({ applicationId: appId, reviewerEmail: pick.email });
    }
    existing.set(appId, have);
  }
  return out;
}
