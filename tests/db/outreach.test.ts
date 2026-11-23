import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffSession } from "@/server/auth/session";
import { adminDb } from "@/server/db/admin";
import { closeDb } from "@/server/db/client";
import { activities, editions, emailTemplates, organisations, outboundMessages, partnerships, sequenceSteps, staffMembers, tasks } from "@/server/db/schema";
import { bootstrapContent } from "@/server/bootstrap";
import { deliverMessage } from "@/server/messaging/outbox";
import { commitImport, previewImport } from "@/server/outreach/import";
import { applyInbound, approveOutreachStep, outreachContext, renderOutreach } from "@/server/privileged/outreach";

/**
 * Whole outreach flow against the local database and Mailpit, using a FAKE spreadsheet with the
 * same structure as the real one. Requires `npx supabase start`.
 */
const run = randomUUID().slice(0, 8);
const owner = { id: randomUUID(), email: `owner-${run}@test.example` };
const session: StaffSession = {
  id: owner.id,
  email: owner.email,
  claims: { sub: owner.id, email: owner.email },
  staff: { email: owner.email, fullName: "Test Owner", roles: ["owner"], active: true },
};
let editionId = "";

const HEADER = ["#", "Organisation", "Who to address (office / role)", "Named contact (as listed publicly)", "Email", "Phone", "Other channel / website", "Location", "Why target them (fit)", "Suggested way in", "Temperature", "Status", "Last contacted", "Next step", "Owner", "Notes", "Source", "Verification"];

async function fakeWorkbook(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const add = (name: string, rows: string[][]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow([`Bharat Yuva: ${name} outreach list`]);
    ws.addRow(["Edit the yellow columns as you go"]);
    ws.addRow(HEADER);
    rows.forEach((r) => ws.addRow(r));
  };
  wb.addWorksheet("How to use").addRow(["Instructions"]);
  add("Universities", [
    ["1", `Test University ${run}`, "Vice-Chancellor", "Dr. Test Person (VC)", `vc-${run}@example.org`, "", "", "Delhi", "Strong policy school", "Email the VC", "Hot", "Not contacted", "", "", "", "", "https://example.org", "Checked on official page, 22 Nov 2026"],
  ]);
  add("Districts", [
    ["1", `Test District ${run}`, "District Collector", "(Officers change on transfer: confirm current names)", `dm-${run}@example.org`, "", "", "Rajasthan", "Aspirational district", "Approach the CEO", "Warm", "Not contacted", "", "", "", "", "https://example.gov", "From a 2024 list: re-confirm before sending"],
  ]);
  add("Embassies", [
    ["1", `Test Embassy ${run}`, "Public Diplomacy", "", "", "+91 11 0000 0000", "https://embassy.example/contact", "New Delhi", "Youth engagement", "Use the contact form", "Cold", "Not contacted", "", "", "", "", "https://embassy.example", "Checked on official page, 22 Nov 2026 (form only)"],
  ]);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

async function partnershipFor(name: string) {
  const [row] = await adminDb()
    .select({ p: partnerships, org: organisations })
    .from(partnerships)
    .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
    .where(and(eq(partnerships.editionId, editionId), eq(organisations.name, name)));
  return row!;
}

async function scheduleFirst(partnershipId: string) {
  await adminDb().update(partnerships).set({ ownerEmail: owner.email }).where(eq(partnerships.id, partnershipId));
  const [step] = await adminDb().insert(sequenceSteps).values({ partnershipId, step: "first", dueAt: "2020-01-01" }).returning();
  return step!;
}

beforeAll(async () => {
  const db = adminDb();
  await bootstrapContent(db);
  await db.execute(sql`insert into auth.users (id, email, aud, role) values (${owner.id}, ${owner.email}, 'authenticated', 'authenticated')`);
  await db.insert(staffMembers).values({ email: owner.email, fullName: "Test Owner", roles: ["owner"], phone: "+91 90000 00000" });
  const [e] = await db
    .insert(editions)
    .values({ slug: `outreach-${run}`, name: "Test Edition", day1Date: "2027-03-12", day2Date: "2027-03-13", day3Date: "2027-03-14", posterUrls: { general: "https://example.org/poster.pdf" } })
    .returning();
  editionId = e!.id;
});

afterAll(async () => {
  const db = adminDb();
  const orgs = await db.select({ id: organisations.id }).from(organisations).where(sql`${organisations.name} like ${`%${run}`}`);
  await db.execute(sql`delete from app.outbound_messages where meta ->> 'partnershipId' in (select p.id::text from app.partnerships p where p.edition_id = ${editionId})`);
  await db.delete(editions).where(eq(editions.id, editionId));
  if (orgs.length) await db.delete(organisations).where(inArray(organisations.id, orgs.map((o) => o.id)));
  await db.delete(staffMembers).where(eq(staffMembers.email, owner.email));
  await db.execute(sql`delete from auth.users where id = ${owner.id}`);
  await closeDb();
});

describe("outreach end to end", () => {
  it("previews and imports the spreadsheet, with verification flags and manual tasks", async () => {
    const buf = await fakeWorkbook();
    const preview = await previewImport(session, buf);
    expect(preview.map((s) => [s.sheet, s.type, s.partners.length])).toEqual([
      ["How to use", null, 0],
      ["Universities", "university", 1],
      ["Districts", "district", 1],
      ["Embassies", "embassy", 1],
    ]);
    const summary = await commitImport(session, { fileName: "fake.xlsx", buffer: buf, overrides: {}, editionId });
    expect(summary).toMatchObject({ created: 3, updated: 0, manualTasks: 1 });

    const district = await partnershipFor(`Test District ${run}`);
    expect(district.org.needsVerification).toBe(true);
    expect(district.p).toMatchObject({ stage: "not_contacted", temperature: "warm" });
    const embassy = await partnershipFor(`Test Embassy ${run}`);
    const [manual] = await adminDb().select().from(tasks).where(eq(tasks.partnershipId, embassy.p.id));
    expect(manual?.kind).toBe("manual_contact");
    expect(manual?.checklist.length).toBeGreaterThan(0);

    // Re-importing updates rather than duplicating.
    const again = await commitImport(session, { fileName: "fake.xlsx", buffer: buf, overrides: {}, editionId });
    expect(again).toMatchObject({ created: 0, updated: 3, contactsAdded: 0, manualTasks: 0 });
  });

  it("guards approval, sends through the local Gmail stand-in, and schedules follow-ups", async () => {
    const district = await partnershipFor(`Test District ${run}`);
    const step = await scheduleFirst(district.p.id);
    const ctx = (await outreachContext(district.p.id))!;
    const rendered = (await renderOutreach(ctx, "first", "Your office supported our first practicum in 2026."))!;
    expect(rendered.missing).toEqual([]);
    expect(rendered.body).toContain("Respected Sir/Madam,");
    expect(rendered.body).toMatch(/\/p\/[A-Za-z0-9_-]+/); // tracked poster link

    const base = { stepId: step.id, actorEmail: owner.email, subject: rendered.subject, body: rendered.body };
    expect(await approveOutreachStep({ ...base, personalLine: "", verificationAcknowledged: true })).toMatchObject({ ok: false, error: "personal_required" });
    expect(await approveOutreachStep({ ...base, personalLine: "Your office supported our first practicum.", verificationAcknowledged: false })).toMatchObject({ ok: false, error: "needs_verification" });
    const ok = await approveOutreachStep({ ...base, personalLine: "Your office supported our first practicum.", verificationAcknowledged: true });
    expect(ok.ok).toBe(true);

    const [msg] = await adminDb().select().from(outboundMessages).where(eq(outboundMessages.idempotencyKey, `outreach:${step.id}`));
    expect(msg).toMatchObject({ channel: "gmail", senderEmail: owner.email, status: "pending" });
    expect(msg!.attachments).toEqual([{ kind: "district_letter", partnershipId: district.p.id }]);

    await adminDb().update(outboundMessages).set({ notBefore: new Date(Date.now() - 1000) }).where(eq(outboundMessages.id, msg!.id));
    expect(await deliverMessage(msg!.id)).toBe("sent");

    const after = await partnershipFor(`Test District ${run}`);
    expect(after.p.stage).toBe("email_sent");
    const steps = await adminDb().select().from(sequenceSteps).where(eq(sequenceSteps.partnershipId, district.p.id));
    expect(steps.map((s) => `${s.step}:${s.status}`).sort()).toEqual(["call:pending", "first:sent", "fu1:pending", "fu2:pending"]);

    // Mailpit received it, with the letter attached.
    const res = await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:"dm-${run}@example.org"`)}`);
    const found = (await res.json()) as { messages: { Subject: string; Attachments: number }[] };
    expect(found.messages[0]?.Subject).toContain("field immersion");
    expect(found.messages[0]?.Attachments).toBe(1);
  });

  it("a reply stops the sequence and moves the partner to In discussion", async () => {
    const district = await partnershipFor(`Test District ${run}`);
    expect(await applyInbound(district.p.id, { from: "Office <dm@example.org>", subject: "Re: Request", body: "Out of office", headers: { "auto-submitted": "auto-replied" } })).toBe("auto_reply");
    expect((await partnershipFor(`Test District ${run}`)).p.stage).toBe("email_sent");

    expect(await applyInbound(district.p.id, { from: "dm@example.org", subject: "Re: Request", body: "Please call the CEO Zila Parishad on Monday." })).toBe("reply");
    expect((await partnershipFor(`Test District ${run}`)).p.stage).toBe("in_discussion");
    const pending = await adminDb().select().from(sequenceSteps).where(and(eq(sequenceSteps.partnershipId, district.p.id), eq(sequenceSteps.status, "pending")));
    expect(pending).toHaveLength(0);
    const kinds = (await adminDb().select({ kind: activities.kind }).from(activities).where(eq(activities.partnershipId, district.p.id))).map((a) => a.kind);
    expect(kinds).toContain("reply");
  });

  it("“no” marks Do-not-contact; a bounce flags the contact and creates a task", async () => {
    const uni = await partnershipFor(`Test University ${run}`);
    await scheduleFirst(uni.p.id);
    expect(await applyInbound(uni.p.id, { from: "vc@example.org", subject: "Re: x", body: "No thanks." })).toBe("optout");
    const after = await partnershipFor(`Test University ${run}`);
    expect(after.p.stage).toBe("do_not_contact");
    expect(after.org.doNotContact).toBe(true);

    const embassy = await partnershipFor(`Test Embassy ${run}`);
    expect(await applyInbound(embassy.p.id, { from: "Mail Delivery Subsystem <mailer-daemon@google.com>", subject: "Delivery Status Notification (Failure)", body: "" })).toBe("bounce");
    const bounceTasks = await adminDb().select().from(tasks).where(and(eq(tasks.partnershipId, embassy.p.id), eq(tasks.kind, "bounce")));
    expect(bounceTasks).toHaveLength(1);
  });

  it("seeded templates exist for every partner type and step", async () => {
    const rows = await adminDb().select({ t: emailTemplates.partnerType, s: emailTemplates.step }).from(emailTemplates);
    expect(rows.length).toBeGreaterThanOrEqual(12);
  });
});
