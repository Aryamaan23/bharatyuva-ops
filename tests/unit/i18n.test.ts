import { describe, expect, it } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { hi } from "@/i18n/dictionaries/hi";

function leaves(obj: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof obj === "string") out.set(prefix, obj);
  else if (Array.isArray(obj)) obj.forEach((v, i) => leaves(v, `${prefix}[${i}]`).forEach((s, k) => out.set(k, s)));
  else if (obj && typeof obj === "object")
    for (const [k, v] of Object.entries(obj)) leaves(v, prefix ? `${prefix}.${k}` : k).forEach((s, key) => out.set(key, s));
  return out;
}

describe("dictionaries", () => {
  const enLeaves = leaves(en);
  const hiLeaves = leaves(hi);
  it("Hindi has every English string, non-empty", () => {
    for (const key of enLeaves.keys()) expect(hiLeaves.get(key), key).toBeTruthy();
  });
  it("placeholders match between languages", () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const [key, value] of enLeaves) expect(ph(hiLeaves.get(key) ?? ""), key).toBe(ph(value));
  });
});
