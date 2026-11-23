import { describe, expect, it } from "vitest";
import { certificateCode, pastRetention, signPass, verifyPass } from "@/server/domain/passes";
import { formTeams, teamCountFor, type Fellow } from "@/server/domain/teams";

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

describe("team formation", () => {
  const disciplines = ["law", "stem", "social_sciences", "commerce"];
  const states = ["Delhi", "Bihar", "Kerala", "Punjab", "Assam"];
  const fellows: Fellow[] = Array.from({ length: 42 }, (_, i) => ({ id: uuid(i), discipline: disciplines[i % 4]!, state: states[i % 5]!, gender: i % 2 ? "woman" : "man" }));

  it("makes teams that differ in size by at most one and contain everyone once", () => {
    const teams = formTeams(fellows, 7);
    expect(teams).toHaveLength(7);
    const sizes = teams.map((t) => t.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(new Set(teams.flat()).size).toBe(42);
  });

  it("spreads disciplines across teams", () => {
    const teams = formTeams(fellows, 7);
    const byId = new Map(fellows.map((f) => [f.id, f]));
    for (const t of teams) {
      const ds = new Set(t.map((id) => byId.get(id)!.discipline));
      expect(ds.size).toBeGreaterThanOrEqual(3);
    }
  });

  it("chooses a team count from a target size", () => {
    expect(teamCountFor(42, 6)).toBe(7);
    expect(teamCountFor(3, 6)).toBe(1);
    expect(formTeams([], 5)).toEqual([[]]);
  });
});

describe("passes and certificates", () => {
  const secret = "s".repeat(40);
  it("verifies genuine passes and rejects tampered ones", () => {
    const token = signPass(uuid(7), secret);
    expect(verifyPass(token, secret)).toBe(uuid(7));
    expect(verifyPass(token.replace(uuid(7), uuid(8)), secret)).toBeNull();
    expect(verifyPass(`${uuid(7)}.forged`, secret)).toBeNull();
    expect(verifyPass("garbage", secret)).toBeNull();
  });
  it("makes readable certificate codes", () => {
    expect(certificateCode(2027, () => 0)).toBe("BY27-AAAA-AAAA");
  });
  it("computes retention from the edition's last day", () => {
    expect(pastRetention("2027-03-14", 12, new Date("2028-03-13T00:00:00Z"))).toBe(false);
    expect(pastRetention("2027-03-14", 12, new Date("2028-03-14T00:00:00Z"))).toBe(true);
    expect(pastRetention(null, 12, new Date())).toBe(false);
  });
});
