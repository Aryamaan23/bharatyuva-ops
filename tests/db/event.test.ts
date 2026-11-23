import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb } from "@/server/db/admin";
import { closeDb } from "@/server/db/client";
import { applicants, applications, certificates, checkins, editions, formDefinitions, organisations, partnerships, staffMembers, teamMembers, teams } from "@/server/db/schema";
import { DEFAULT_FORM } from "@/lib/forms/default-form";
import { certificatePdf, checkIn, compendiumPdf, findCertificate, issueCertificates, passTokenFor } from "@/server/privileged/event";
import { districtLetterPdf } from "@/server/privileged/letters";
import { startNextEdition } from "@/server/privileged/next-edition";
import { runRetentionSweep } from "@/server/privileged/retention";

const run = randomUUID().slice(0, 8);
let editionId = "";
let nextEditionId = "";
const appIds: string[] = [];
const orgIds: string[] = [];

beforeAll(async () => {
  const db = adminDb();
  const [e] = await db
    .insert(editions)
    .values({ slug: `ev-${run}`, name: "Event Test", day1Date: "2024-03-12", day2Date: "2024-03-13", day3Date: "2024-03-14", retentionMonths: 12 })
    .returning();
  editionId = e!.id;
  await db.insert(formDefinitions).values({ editionId, version: 1, definition: DEFAULT_FORM, publishedAt: new Date() });
  const statuses = ["confirmed", "confirmed", "rejected", "waitlisted"] as const;
  for (const [i, status] of statuses.entries()) {
    const email = `ev${i}-${run}@test.example`;
    const [a] = await db.insert(applicants).values({ email, emailCanonical: email, fullName: `Fellow ${i}`, college: "Test College" }).returning();
    const [app] = await db.insert(applications).values({ editionId, applicantId: a!.id, formVersion: 1, status, submittedAt: new Date() }).returning();
    appIds.push(app!.id);
  }
  const [t] = await db.insert(teams).values({ editionId, number: 1, name: "Team Alpha", isWinner: true }).returning();
  await db.insert(teamMembers).values([{ teamId: t!.id, applicationId: appIds[0]! }, { teamId: t!.id, applicationId: appIds[1]! }]);
  for (const [i, dnc] of [false, true].entries()) {
    const [o] = await db.insert(organisations).values({ type: "district", name: `Ev District ${i} ${run}`, importKey: `district:ev ${i} ${run}`, doNotContact: dnc, location: "Rajasthan" }).returning();
    orgIds.push(o!.id);
    await db.insert(partnerships).values({ editionId, organisationId: o!.id, stage: i === 0 ? "confirmed" : "declined", temperature: "warm" });
  }
});

afterAll(async () => {
  const db = adminDb();
  for (const id of [editionId, nextEditionId].filter(Boolean)) {
    await db.delete(certificates).where(eq(certificates.editionId, id));
    await db.delete(applications).where(eq(applications.editionId, id));
    await db.delete(editions).where(eq(editions.id, id));
  }
  await db.delete(applicants).where(sql`${applicants.email} like ${`%-${run}@test.example`}`);
  if (orgIds.length) await db.delete(organisations).where(inArray(organisations.id, orgIds));
  await closeDb();
});

describe("event day and after", () => {
  it("checks fellows in from a signed pass, once per day", async () => {
    const token = passTokenFor(appIds[0]!);
    const first = await checkIn({ token, day: 1, staffEmail: "staff@test.example", editionId, clientId: "c1" });
    expect(first).toMatchObject({ ok: true, already: false, name: "Fellow 0", team: "Team Alpha" });
    expect(await checkIn({ token, day: 1, staffEmail: "staff@test.example", editionId })).toMatchObject({ ok: true, already: true });
    expect(await checkIn({ token: token.slice(0, -2) + "xx", day: 1, staffEmail: "s", editionId })).toMatchObject({ ok: false, error: "invalid_pass" });
    expect(await checkIn({ token: passTokenFor(appIds[2]!), day: 1, staffEmail: "s", editionId })).toMatchObject({ ok: false, error: "not_a_fellow" });
    const [app] = await adminDb().select().from(applications).where(eq(applications.id, appIds[0]!));
    expect(app?.status).toBe("attended");
    expect(await adminDb().select().from(checkins).where(eq(checkins.applicationId, appIds[0]!))).toHaveLength(1);
  });

  it("issues certificates from attendance and the winning team, verifiable by code", async () => {
    const counts = await issueCertificates(editionId, "admin@test.example");
    expect(counts).toMatchObject({ participation: 1, winner: 2 });
    expect(await issueCertificates(editionId, "admin@test.example")).toMatchObject({ participation: 0, winner: 0 });
    const [cert] = await adminDb().select().from(certificates).where(eq(certificates.applicationId, appIds[0]!)).limit(1);
    const found = await findCertificate(cert!.code);
    expect(found?.c.recipientName).toBe("Fellow 0");
    const pdf = await certificatePdf(cert!.code);
    expect(pdf?.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await findCertificate("BY27-XXXX-XXXX")).toBeNull();
  });

  it("renders the compendium and a district letter as real PDFs", async () => {
    const pdf = await compendiumPdf(editionId, "Test Compendium", "Intro");
    expect(pdf?.subarray(0, 5).toString()).toBe("%PDF-");
    const [p] = await adminDb().select().from(partnerships).where(eq(partnerships.organisationId, orgIds[0]!));
    const letter = await districtLetterPdf(p!.id);
    expect(letter?.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(letter?.filename).toMatch(/\.pdf$/);
  });

  it("starts the next edition with partners carried over, excluding do-not-contact", async () => {
    const next = await startNextEdition(editionId, { name: "Event Test 2", slug: `ev2-${run}` }, "admin@test.example");
    nextEditionId = next.id;
    const carried = await adminDb().select().from(partnerships).where(eq(partnerships.editionId, next.id));
    const mine = carried.filter((c) => orgIds.includes(c.organisationId));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ pastPartner: true, temperature: "hot", stage: "not_contacted" });
    const [form] = await adminDb().select().from(formDefinitions).where(eq(formDefinitions.editionId, next.id));
    expect(form?.definition.steps.length).toBeGreaterThan(0);
  });

  it("retention sweep deletes unsuccessful applications but keeps fellows", async () => {
    const r = await runRetentionSweep(new Date("2026-01-01T00:00:00Z"));
    expect(r.deletedApplications).toBeGreaterThanOrEqual(2);
    const left = await adminDb().select({ id: applications.id, status: applications.status }).from(applications).where(eq(applications.editionId, editionId));
    expect(left.map((l) => l.status).sort()).toEqual(["attended", "confirmed"]);
    const staff = await adminDb().select().from(staffMembers).limit(1);
    expect(staff).toBeDefined();
  });
});
