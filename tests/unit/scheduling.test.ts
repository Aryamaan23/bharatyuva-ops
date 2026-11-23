import { describe, expect, it } from "vitest";
import { applicationWindow, daysUntil, formatDayRange } from "@/server/domain/editions";
import { draftReminderDue } from "@/server/domain/reminders";
import { decideDelivery, nextRetryDelay, startOfIstDay, MAX_ATTEMPTS, type DeliveryConfig } from "@/server/messaging/delivery";
import { safeNextPath } from "@/server/auth/redirect";

const H = 3600_000;

describe("draftReminderDue", () => {
  const close = new Date("2027-01-31T18:29:00Z");
  it("sends 48h then 24h reminders, nothing earlier or after", () => {
    expect(draftReminderDue(close, new Date(close.getTime() - 60 * H))).toBeNull();
    expect(draftReminderDue(close, new Date(close.getTime() - 30 * H))).toBe("48h");
    expect(draftReminderDue(close, new Date(close.getTime() - 6 * H))).toBe("24h");
    expect(draftReminderDue(close, new Date(close.getTime() + H))).toBeNull();
  });
  it("a daily 18:00 IST job always hits both windows", () => {
    for (let offsetHours = 0; offsetHours < 24; offsetHours++) {
      const kinds = new Set<string>();
      for (let day = 0; day < 4; day++) {
        const now = new Date(close.getTime() - (offsetHours + day * 24) * H - 1);
        const k = draftReminderDue(close, now);
        if (k) kinds.add(k);
      }
      expect([...kinds].sort()).toEqual(["24h", "48h"]);
    }
  });
});

describe("decideDelivery", () => {
  const base: DeliveryConfig = { mode: "live", transport: "resend", vercelEnv: "preview", smtpHost: "127.0.0.1", testInbox: "qa@example.org" };
  it("never sends to real recipients outside production", () => {
    expect(decideDelivery(base, "applicant@example.com")).toEqual({
      action: "send",
      to: "qa@example.org",
      subjectPrefix: "[to: applicant@example.com] ",
      status: "redirected",
    });
    expect(decideDelivery({ ...base, vercelEnv: undefined }, "a@b.c")).toMatchObject({ to: "qa@example.org" });
  });
  it("logs instead of sending when redirecting without a test inbox", () => {
    expect(decideDelivery({ ...base, testInbox: undefined }, "a@b.c").action).toBe("log");
  });
  it("sends live only in production", () => {
    expect(decideDelivery({ ...base, vercelEnv: "production" }, "a@b.c")).toMatchObject({ to: "a@b.c", status: "sent" });
  });
  it("allows local SMTP capture (Mailpit) in development", () => {
    expect(decideDelivery({ ...base, transport: "smtp", vercelEnv: undefined }, "a@b.c")).toMatchObject({ to: "a@b.c" });
    // ...but not a remote SMTP host, and not on Vercel previews
    expect(decideDelivery({ ...base, transport: "smtp", smtpHost: "smtp.example.com", vercelEnv: undefined }, "a@b.c")).toMatchObject({ to: "qa@example.org" });
    expect(decideDelivery({ ...base, transport: "smtp", vercelEnv: "preview" }, "a@b.c")).toMatchObject({ to: "qa@example.org" });
  });
  it("respects log mode everywhere", () => {
    expect(decideDelivery({ ...base, mode: "log", vercelEnv: "production" }, "a@b.c").action).toBe("log");
  });
});

describe("retries", () => {
  it("backs off then gives up", () => {
    expect(nextRetryDelay(1)).toBe(60_000);
    expect(nextRetryDelay(5)).toBe(12 * H);
    expect(nextRetryDelay(MAX_ATTEMPTS)).toBeNull();
  });
  it("computes IST midnight", () => {
    expect(startOfIstDay(new Date("2026-11-23T20:00:00Z")).toISOString()).toBe("2026-11-23T18:30:00.000Z");
    expect(startOfIstDay(new Date("2026-11-23T10:00:00Z")).toISOString()).toBe("2026-11-22T18:30:00.000Z");
  });
});

describe("editions", () => {
  const e = { applicationsOpenAt: new Date("2027-01-01T00:00:00Z"), applicationsCloseAt: new Date("2027-02-01T00:00:00Z") };
  it("computes the application window", () => {
    expect(applicationWindow(e, new Date("2026-12-31T00:00:00Z"))).toBe("not_open");
    expect(applicationWindow(e, new Date("2027-01-15T00:00:00Z"))).toBe("open");
    expect(applicationWindow(e, new Date("2027-02-01T00:00:00Z"))).toBe("closed");
    expect(applicationWindow({ applicationsOpenAt: null, applicationsCloseAt: null }, new Date())).toBe("not_open");
  });
  it("counts days to Day 1 in IST", () => {
    expect(daysUntil("2026-11-25", new Date("2026-11-23T20:00:00Z"))).toBe(1);
    expect(daysUntil("2026-11-25", new Date("2026-11-23T10:00:00Z"))).toBe(2);
  });
  it("formats the day range", () => {
    expect(formatDayRange({ day1Date: null, day3Date: null })).toBeNull();
    expect(formatDayRange({ day1Date: "2027-03-12", day3Date: "2027-03-14" })).toBe("12 March 2027 – 14 March 2027");
  });
});

describe("safeNextPath", () => {
  const app = "https://by.example.org";
  it("blocks open redirects", () => {
    expect(safeNextPath("/en/apply", app)).toBe("/en/apply");
    expect(safeNextPath("https://by.example.org/admin?x=1", app)).toBe("/admin?x=1");
    expect(safeNextPath("https://evil.com/phish", app)).toBe("/");
    expect(safeNextPath("//evil.com", app)).toBe("/");
    expect(safeNextPath(null, app, "/en/me")).toBe("/en/me");
  });
});
