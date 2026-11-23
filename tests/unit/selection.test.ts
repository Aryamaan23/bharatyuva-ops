import { describe, expect, it } from "vitest";
import { makeAmbassadorCode } from "@/server/domain/ambassador";
import { assignReviewers } from "@/server/domain/assignment";
import { aggregateTotals, DEFAULT_RUBRIC, validateScores, weightedTotal } from "@/server/domain/scoring";
import { offerExpired, openSeats, seatReminderDue, waitlistOrder } from "@/server/domain/waitlist";

describe("reviewer assignment", () => {
  it("gives every application two distinct reviewers with even load", () => {
    const apps = Array.from({ length: 30 }, (_, i) => `a${i}`);
    const reviewers = ["r1", "r2", "r3", "r4", "r5"].map((email) => ({ email, load: 0 }));
    const out = assignReviewers(apps, reviewers, new Map(), 2, () => 0.5);
    expect(out).toHaveLength(60);
    for (const a of apps) {
      const rs = out.filter((o) => o.applicationId === a).map((o) => o.reviewerEmail);
      expect(new Set(rs).size).toBe(2);
    }
    const loads = reviewers.map((r) => out.filter((o) => o.reviewerEmail === r.email).length);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
  });

  it("varies reviewer pairs instead of repeating one pair", () => {
    const apps = Array.from({ length: 12 }, (_, i) => `a${i}`);
    const reviewers = ["r1", "r2", "r3", "r4"].map((email) => ({ email, load: 0 }));
    const out = assignReviewers(apps, reviewers, new Map(), 2, () => 0.5);
    const pairs = new Map<string, number>();
    for (const a of apps) {
      const k = out.filter((o) => o.applicationId === a).map((o) => o.reviewerEmail).sort().join("|");
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
    expect(pairs.size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...pairs.values())).toBeLessThanOrEqual(3);
  });

  it("tops up partial assignments and respects existing load", () => {
    const existing = new Map([["a1", new Set(["r1"])]]);
    const out = assignReviewers(["a1"], [{ email: "r1", load: 5 }, { email: "r2", load: 9 }, { email: "r3", load: 1 }], existing);
    expect(out).toEqual([{ applicationId: "a1", reviewerEmail: "r3" }]);
    expect(assignReviewers(["x"], [], new Map())).toEqual([]);
  });
});

describe("scoring", () => {
  it("validates and weights scores", () => {
    expect(validateScores(DEFAULT_RUBRIC, { motivation: 6 })).toMatchObject({ motivation: expect.any(String), problem: "Score required" });
    const all5 = Object.fromEntries(DEFAULT_RUBRIC.map((c) => [c.key, 5]));
    expect(weightedTotal(DEFAULT_RUBRIC, all5)).toBe(100);
    expect(weightedTotal(DEFAULT_RUBRIC, { ...all5, problem: 0 })).toBeCloseTo(66.67, 1);
  });
  it("flags disagreement over 30 points", () => {
    expect(aggregateTotals([80, 40])).toMatchObject({ mean: 60, spread: 40, disagreement: true });
    expect(aggregateTotals([70, 60])).toMatchObject({ disagreement: false });
    expect(aggregateTotals([])).toMatchObject({ mean: null, count: 0 });
  });
});

describe("waitlist", () => {
  const now = new Date("2027-02-01T12:00:00Z");
  it("computes open seats and offer timing", () => {
    expect(openSeats(50, 10, 38)).toBe(2);
    expect(openSeats(50, 20, 40)).toBe(0);
    expect(offerExpired(new Date("2027-02-01T11:00:00Z"), now)).toBe(true);
    expect(seatReminderDue(new Date("2027-02-02T06:00:00Z"), now)).toBe(true);
    expect(seatReminderDue(new Date("2027-02-03T06:00:00Z"), now)).toBe(false);
  });
  it("orders by rank, then score", () => {
    const rows = [
      { id: "a", waitlistRank: null, mean: 90 },
      { id: "b", waitlistRank: 2, mean: 50 },
      { id: "c", waitlistRank: 1, mean: 40 },
      { id: "d", waitlistRank: null, mean: 95 },
    ];
    expect(waitlistOrder(rows).map((r) => r.id)).toEqual(["c", "b", "d", "a"]);
  });
});

describe("ambassador codes", () => {
  it("are readable and unambiguous", () => {
    expect(makeAmbassadorCode("Riya Sharma", () => 0)).toBe("AMB-RIYA-AAAA");
    expect(makeAmbassadorCode("राहुल", () => 0.99)).toMatch(/^AMB-BY-[A-Z2-9]{4}$/);
  });
});
