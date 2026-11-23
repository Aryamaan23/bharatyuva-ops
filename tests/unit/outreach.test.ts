import { describe, expect, it } from "vitest";
import { DEFAULT_TIMELINE } from "@/content/timeline";
import { OUTREACH_TEMPLATES } from "@/content/outreach-templates";
import { autoMapColumns, detectHeaderRow, needsVerificationCheck, parsePartnerRow, sheetPartnerType, splitContacts } from "@/server/domain/import";
import { MERGE_FIELDS, renderTemplate, salutationFor } from "@/server/domain/merge";
import { classifyReply, stripQuoted } from "@/server/domain/replies";
import { followUpDates, sequenceHalted, stageAfterSend } from "@/server/domain/sequences";
import { remainingCap, spacedSendTimes } from "@/server/domain/spacing";
import { planTimeline } from "@/server/domain/timeline";

const HEADER = ["#", "Organisation", "Who to address (office / role)", "Named contact (as listed publicly)", "Email", "Phone", "Other channel / website", "Location", "Why target them (fit)", "Suggested way in", "Temperature", "Status", "Last contacted", "Next step", "Owner", "Notes", "Source", "Verification"];

describe("spreadsheet import rules", () => {
  it("detects the header row and maps columns by name", () => {
    const rows = [["Title"], ["Edit the yellow columns"], HEADER];
    expect(detectHeaderRow(rows)).toBe(2);
    const map = autoMapColumns(HEADER);
    expect(map).toMatchObject({ organisation: 1, role: 2, contactName: 3, email: 4, phone: 5, otherChannel: 6, temperature: 10, status: 11, verification: 17 });
  });

  it("maps sheet names to partner types", () => {
    expect(sheetPartnerType("Universities")).toBe("university");
    expect(sheetPartnerType("Districts")).toBe("district");
    expect(sheetPartnerType("Embassies")).toBe("embassy");
    expect(sheetPartnerType("Summary")).toBeNull();
  });

  it("splits multiple named contacts and emails", () => {
    const c = splitContacts("Asha Rao (Director); Vikram Shah (CEO)", "Director; CEO", "a@uni.edu; b@uni.edu", "+91 1");
    expect(c).toEqual([
      { name: "Asha Rao", roleTitle: "Director", email: "a@uni.edu", phone: "+91 1" },
      { name: "Vikram Shah", roleTitle: "CEO", email: "b@uni.edu", phone: null },
    ]);
  });

  it("flags rows whose notes say to confirm before sending", () => {
    expect(needsVerificationCheck("From a list of DM emails (2024): re-confirm before sending", null)).toBe(true);
    expect(needsVerificationCheck("Checked on official page, 22 Nov 2026", null)).toBe(false);
    expect(needsVerificationCheck("Checked on official page", "(Officers change on transfer: confirm current names)")).toBe(true);
  });

  it("parses a district row and turns form/phone-only rows into manual tasks", () => {
    const map = autoMapColumns(HEADER);
    const row = ["1", "Example District, Rajasthan", "District Collector", "(Officers change on transfer: confirm current names)", "dm-example@nic.in", "", "", "Rajasthan", "Hosted the practicum", "Re-approach the CEO", "Hot", "Not contacted", "", "", "", "", "https://example.gov", "re-confirm before sending"];
    const p = parsePartnerRow("district", row, map)!;
    expect(p).toMatchObject({ name: "Example District, Rajasthan", temperature: "hot", stage: "not_contacted", needsVerification: true, manualChannel: null });
    expect(p.contacts[0]).toMatchObject({ email: "dm-example@nic.in", name: null });

    const formOnly = [...row];
    formOnly[4] = "";
    formOnly[6] = "https://embassy.example/contact";
    formOnly[17] = "Checked on official page (form only)";
    expect(parsePartnerRow("embassy", formOnly, map)!.manualChannel).toBe("form");
    expect(parsePartnerRow("embassy", ["", ""], map)).toBeNull();
  });
});

describe("templates and merge fields", () => {
  it("merges every field and reports missing or unknown ones", () => {
    const r = renderTemplate("{{salutation}} {{org}} {{oops}} {{personal}}", { salutation: "Dear X,", org: "Org" });
    expect(r.text).toBe("Dear X, Org {{oops}} {{personal}}");
    expect(r.missing).toEqual(["personal"]);
    expect(r.unknown).toEqual(["oops"]);
  });

  it("seed templates cover 3 types x 3 steps, use only known fields, and first emails offer opt-out", () => {
    const outreach = OUTREACH_TEMPLATES.filter((t) => t.step !== "thank_you");
    expect(outreach).toHaveLength(9);
    for (const t of OUTREACH_TEMPLATES) {
      const values = Object.fromEntries(MERGE_FIELDS.map((f) => [f, "x"]));
      expect(renderTemplate(t.subject + t.body, values).unknown).toEqual([]);
      expect(t.body).toContain("{{personal}}");
      if (t.step === "first") expect(t.body).toMatch(/reply "no"/);
    }
  });

  it("picks a sensible salutation", () => {
    expect(salutationFor({ name: "Dr. Meena Iyer" }, "university")).toBe("Dear Dr. Meena Iyer,");
    expect(salutationFor({ name: "(Officers change on transfer: confirm current names)" }, "district")).toBe("Respected Sir/Madam,");
    expect(salutationFor({ name: null, roleTitle: "Press and Information Section" }, "embassy")).toBe("Dear Press and Information Section,");
  });
});

describe("sequences", () => {
  it("schedules follow-ups on day 5 and 12 and a call on day 15", () => {
    expect(followUpDates("2027-01-01")).toEqual([
      { step: "fu1", dueAt: "2027-01-06" },
      { step: "fu2", dueAt: "2027-01-13" },
      { step: "call", dueAt: "2027-01-16" },
    ]);
  });
  it("moves stage forward only", () => {
    expect(stageAfterSend("not_contacted", "first")).toBe("email_sent");
    expect(stageAfterSend("email_sent", "fu1")).toBe("follow_up_1");
    expect(stageAfterSend("in_discussion", "fu2")).toBe("in_discussion");
    expect(sequenceHalted("in_discussion")).toBe(true);
    expect(sequenceHalted("email_sent")).toBe(false);
  });
});

describe("reply detection", () => {
  it("classifies bounces, auto-replies, opt-outs and real replies", () => {
    expect(classifyReply({ from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", subject: "Delivery Status Notification (Failure)", body: "" })).toBe("bounce");
    expect(classifyReply({ from: "dm@nic.in", subject: "Automatic reply: Request", body: "I am out of office" })).toBe("auto_reply");
    expect(classifyReply({ from: "a@b.c", subject: "Re: x", body: "No thanks.\n\nOn Mon, X wrote:\n> hello" })).toBe("optout");
    expect(classifyReply({ from: "a@b.c", subject: "Re: x", body: "नहीं, धन्यवाद" })).toBe("optout");
    expect(classifyReply({ from: "a@b.c", subject: "Re: x", body: "No problem, let's talk on Monday." })).toBe("reply");
    expect(classifyReply({ from: "a@b.c", subject: "Re: x", body: "Happy to help. Please call my PA." })).toBe("reply");
  });
  it("strips quoted text", () => {
    expect(stripQuoted("Yes please\n\nOn Tue, 1 Jan 2027, Asha wrote:\n> Dear Sir")).toBe("Yes please");
  });
});

describe("sending pace", () => {
  it("spaces sends 3-8 minutes apart", () => {
    const start = new Date("2027-01-01T04:00:00Z");
    const times = spacedSendTimes(4, start, () => 0.5);
    expect(times.map((t) => (t.getTime() - start.getTime()) / 60_000)).toEqual([0, 5.5, 11, 16.5]);
  });
  it("respects the daily cap", () => {
    expect(remainingCap(30, 28)).toBe(2);
    expect(remainingCap(30, 40)).toBe(0);
  });
});

describe("timeline", () => {
  it("has the 25 tasks and dates them from Day 1", () => {
    expect(DEFAULT_TIMELINE).toHaveLength(25);
    const plan = planTimeline("2027-03-12", DEFAULT_TIMELINE);
    expect(plan[0]).toMatchObject({ title: "Fix dates", dueAt: "2026-11-12" });
    expect(plan.find((t) => t.title === "Day 1")?.dueAt).toBe("2027-03-12");
    expect(plan.at(-1)).toMatchObject({ title: "Debrief and update the template", dueAt: "2027-04-11" });
  });
});
