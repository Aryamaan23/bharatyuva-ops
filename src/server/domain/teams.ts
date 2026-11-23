export type Fellow = { id: string; discipline: string | null; state: string | null; gender: string | null };

/**
 * Balanced teams: order fellows so that people with the same discipline (then state, then
 * gender) sit next to each other, then deal them out in a "snake" (1,2,3,3,2,1…). Neighbours
 * land on different teams, so every team gets a mix and sizes differ by at most one.
 */
export function formTeams(fellows: Fellow[], teamCount: number): string[][] {
  const n = Math.max(1, Math.min(teamCount, fellows.length || 1));
  const key = (f: Fellow) => [f.discipline ?? "~", f.state ?? "~", f.gender ?? "~", f.id].join("|");
  const ordered = [...fellows].sort((a, b) => key(a).localeCompare(key(b)));
  const teams: string[][] = Array.from({ length: n }, () => []);
  ordered.forEach((f, i) => {
    const round = Math.floor(i / n);
    const pos = i % n;
    teams[round % 2 === 0 ? pos : n - 1 - pos]!.push(f.id);
  });
  return teams;
}

export function teamCountFor(fellows: number, targetSize: number): number {
  return Math.max(1, Math.round(fellows / Math.max(2, targetSize)));
}
