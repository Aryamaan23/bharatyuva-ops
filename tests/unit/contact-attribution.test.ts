import { describe, expect, it } from "vitest";
import { attributionFromUrl, parseAttributionCookie, referralFromUrl, sanitizeReferral } from "@/lib/attribution";
import { ageOn, canonicalEmail, normalizePhone } from "@/lib/contact";

describe("normalizePhone", () => {
  it("assumes India and returns E.164", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("+91-98765-43210")).toBe("+919876543210");
    expect(normalizePhone("0098765")).toBeNull();
  });
});

describe("canonicalEmail", () => {
  it("collapses Gmail dots and plus tags only for Gmail", () => {
    expect(canonicalEmail("A.Sha+by@Gmail.com")).toBe("asha@gmail.com");
    expect(canonicalEmail("a.sha@googlemail.com")).toBe("asha@gmail.com");
    expect(canonicalEmail("a.sha+x@college.ac.in")).toBe("a.sha@college.ac.in");
  });
});

describe("ageOn", () => {
  it("handles birthdays not yet reached", () => {
    expect(ageOn("2008-03-15", "2026-03-14")).toBe(17);
    expect(ageOn("2008-03-15", "2026-03-15")).toBe(18);
  });
});

describe("attribution", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  it("captures UTM params and ignores junk", () => {
    const a = attributionFromUrl(new URL("https://x.in/en?utm_source=instagram&utm_campaign=by2<script>"), now);
    expect(a).toMatchObject({ source: "instagram", landingPath: "/en" });
    expect(a?.campaign).toBeUndefined();
    expect(attributionFromUrl(new URL("https://x.in/en"), now)).toBeNull();
  });
  it("validates referral codes", () => {
    expect(referralFromUrl(new URL("https://x.in/?ref=amb-12ab"))).toBe("AMB-12AB");
    expect(referralFromUrl(new URL("https://x.in/?ref=<x>"))).toBeNull();
    expect(sanitizeReferral("a")).toBeNull();
  });
  it("parses only known cookie keys", () => {
    expect(parseAttributionCookie('{"source":"li","evil":"x"}')).toEqual({ source: "li" });
    expect(parseAttributionCookie("not json")).toEqual({});
  });
});
