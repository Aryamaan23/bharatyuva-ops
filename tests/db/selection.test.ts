import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/auth/session";
import { adminDb } from "@/server/db/admin";
import { closeDb } from "@/server/db/client";
import {
  ambassadors,
  applicants,
  applications,
  decisionBatches,
  editions,
  formDefinitions,
  interviewSlots,
  outboundMessages,
  reviewAssignments,
  reviews,
  staffMembers,
} from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { DEFAULT_FORM } from "@/lib/forms/default-form";
import { leaderboard, reviewAmbassador } from "@/server/privileged/ambassadors";
import { applyDecisionBatch, assignPendingReviews, bookInterview, promoteWaitlist, reviewerView, runSeatAutomation } from "@/server/privileged/selection";

const run = randomUUID().slice(0, 8);
const reviewers = ["r1", "r2", "r3"].map((r) => ({ id: randomUUID(), email: `${r}-${run}@test.example` }));
let editionId = "";
const appIds: string[] = [];
const users: SessionUser[] = [];

beforeAll(async () => {
  const db = adminDb();
  const [e] = await db.insert(editions).values({ slug: `sel-${run}`, name: "Selection Test", seats: 2, seatConfirmHours: 48 }).returning();
  editionId = e!.id;
  await db.insert(formDefinitions).values({ editionId, version: 1, definition: DEFAULT_FORM, publishedAt: new Date() });
  for (const r of reviewers) {
    await db.execute(sql`insert into auth.users (id, email, aud, role) values (${r.id}, ${r.email}, 'authenticated', 'authenticated')`);
    await db.insert(staffMembers).values({ email: r.email, fullName: r.email, roles: ["reviewer"] });
  }
  for (let i = 0; i < 6; i++) {
    const id = randomUUID();
    const email = `app${i}-${run}@test.example`;
    await db.execute(sql`insert into auth.users (id, email, aud, role) values (${id}, ${email}, 'authenticated', 'authenticated')`);
    users.push({ id, email, claims: { sub: id, email } });
    const [a] = await db.insert(applicants).values({ userId: id, email, emailCanonical: email, fullName: `Applicant ${i}`, phoneE164: "+919800000000" }).returning();
    const [app] = await db
      .insert(applications)
      .values({
        editionId,
        applicantId: a!.id,
        formVersion: 1,
        status: "submitted",
        submittedAt: new Date(),
        referralCode: i < 3 ? "AMB-TEST-ZZZZ" : null,
        answers: { full_name: `Applicant ${i}`, phone: "+919800000000", why_bharat_yuva: `Reason ${i}`, policy_problem: "Water", college: "Test College", state: "Delhi" },
      })
      .returning();
    appIds.push(app!.id);
  }
});

afterAll(async () => {
  const db = adminDb();
  await db.delete(outboundMessages).where(inArray(outboundMessages.relatedId, appIds));
  await db.delete(applications).where(eq(applications.editionId, editionId));
  await db.delete(editions).where(eq(editions.id, editionId));
  for (const u of [...users, ...reviewers]) {
    await db.delete(staffMembers).where(eq(staffMembers.email, u.email));
    await db.delete(applicants).where(eq(applicants.email, u.email));
    await db.execute(sql`delete from auth.users where id = ${u.id}`);
  }
  await closeDb();
});

describe("selection end to end", () => {
  it("assigns two reviewers per application, balanced", async () => {
    const r = await assignPendingReviews(editionId, "admin@test.example");
    expect(r.assigned).toBe(12);
    const rows = await adminDb().select().from(reviewAssignments).where(inArray(reviewAssignments.applicationId, appIds));
    for (const id of appIds) expect(new Set(rows.filter((x) => x.applicationId === id).map((x) => x.reviewerEmail)).size).toBe(2);
    // Our three fresh reviewers start with no load, so they share the work evenly.
    const loads = reviewers.map((rv) => rows.filter((x) => x.reviewerEmail === rv.email).length);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
    // Idempotent
    expect((await assignPendingReviews(editionId, "admin@test.example")).assigned).toBe(0);
    const [app] = await adminDb().select({ s: applications.status }).from(applications).where(eq(applications.id, appIds[0]!));
    expect(app?.s).toBe("under_review");
  });

  it("reviewers see anonymised answers only, and can only score their own assignments", async () => {
    const r1 = reviewers[0]!;
    const [mine] = await adminDb().select().from(reviewAssignments).where(eq(reviewAssignments.reviewerEmail, r1.email)).limit(1);
    const view = await reviewerView(mine!.id, r1.email);
    expect(view).not.toBeNull();
    const ids = view!.answers.map((a) => a.id);
    expect(ids).not.toContain("full_name");
    expect(ids).not.toContain("phone");
    expect(ids).not.toContain("date_of_birth");
    expect(ids).toContain("why_bharat_yuva");
    expect(JSON.stringify(view)).not.toContain("Applicant 0");

    const [theirs] = await adminDb().select().from(reviewAssignments).where(eq(reviewAssignments.reviewerEmail, reviewers[1]!.email)).limit(1);
    expect(await reviewerView(theirs!.id, r1.email)).toBeNull();

    // RLS: writing a review for someone else's assignment fails.
    const claims = { sub: r1.id, email: r1.email };
    await expect(withUserDb(claims, (tx) => tx.insert(reviews).values({ assignmentId: theirs!.id, scores: {}, total: 50 }))).rejects.toThrow();
    await withUserDb(claims, (tx) => tx.insert(reviews).values({ assignmentId: mine!.id, scores: { motivation: 5 }, total: 90 }));
    // Reviewers can't read applicant rows at all.
    expect(await withUserDb(claims, (tx) => tx.select().from(applicants))).toHaveLength(0);
  });

  it("decision batches set statuses and queue one email each, once", async () => {
    const [batch] = await adminDb()
      .insert(decisionBatches)
      .values({ editionId, action: "selected", applicationIds: appIds.slice(0, 2), createdBy: "admin@test.example" })
      .returning();
    const res = await applyDecisionBatch(batch!.id, "admin@test.example");
    expect(res).toMatchObject({ ok: true, sent: 2 });
    expect(await applyDecisionBatch(batch!.id, "admin@test.example")).toMatchObject({ ok: false });
    const selected = await adminDb().select().from(applications).where(inArray(applications.id, appIds.slice(0, 2)));
    expect(selected.every((a) => a.status === "selected" && a.seatOfferExpiresAt)).toBe(true);

    const [wl] = await adminDb()
      .insert(decisionBatches)
      .values({ editionId, action: "waitlisted", applicationIds: appIds.slice(2, 4), createdBy: "admin@test.example" })
      .returning();
    await applyDecisionBatch(wl!.id, "admin@test.example");
    const ranks = await adminDb().select({ id: applications.id, r: applications.waitlistRank }).from(applications).where(inArray(applications.id, appIds.slice(2, 4)));
    expect(ranks.find((x) => x.id === appIds[2])?.r).toBe(1);
    expect(ranks.find((x) => x.id === appIds[3])?.r).toBe(2);
  });

  it("expired offers free a seat and the waitlist is offered in rank order", async () => {
    expect(await promoteWaitlist(editionId)).toBe(0); // 2 seats, 2 live offers
    await adminDb().update(applications).set({ seatOfferExpiresAt: new Date(Date.now() - 1000) }).where(eq(applications.id, appIds[0]!));
    const r = await runSeatAutomation();
    expect(r.expired).toBeGreaterThanOrEqual(1);
    const [first, promoted, stillWaiting] = await Promise.all(
      [appIds[0]!, appIds[2]!, appIds[3]!].map(async (id) => (await adminDb().select().from(applications).where(eq(applications.id, id)))[0]!),
    );
    expect(first!.status).toBe("declined");
    expect(promoted!.status).toBe("selected");
    expect(stillWaiting!.status).toBe("waitlisted");
    const [offerMail] = await adminDb().select().from(outboundMessages).where(and(eq(outboundMessages.relatedId, appIds[2]!), eq(outboundMessages.template, "waitlist_offer")));
    expect(offerMail).toBeDefined();
  });

  it("interview booking respects slot capacity", async () => {
    const [slot] = await adminDb()
      .insert(interviewSlots)
      .values({ editionId, startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 86_400_000 + 900_000), capacity: 1 })
      .returning();
    await adminDb().update(applications).set({ status: "interview" }).where(inArray(applications.id, [appIds[4]!, appIds[5]!]));
    expect(await bookInterview(users[4]!, appIds[4]!, slot!.id)).toBe("booked");
    expect(await bookInterview(users[5]!, appIds[5]!, slot!.id)).toBe("full");
    expect(await bookInterview(users[5]!, appIds[4]!, slot!.id)).toBe("not_allowed"); // not their application
  });

  it("ambassador approval issues a code and referrals are counted", async () => {
    const [a] = await adminDb().insert(ambassadors).values({ editionId, email: `amb-${run}@test.example`, fullName: "Riya Test", college: "Test College", code: null }).returning();
    await reviewAmbassador(a!.id, true, "admin@test.example");
    const [approved] = await adminDb().select().from(ambassadors).where(eq(ambassadors.id, a!.id));
    expect(approved?.code).toMatch(/^AMB-RIYA-/);
    await adminDb().update(ambassadors).set({ code: "AMB-TEST-ZZZZ" }).where(eq(ambassadors.id, a!.id));
    const board = await leaderboard(editionId);
    expect(board[0]).toMatchObject({ fullName: "Riya Test", submitted: 3, started: 3 });
  });
});
