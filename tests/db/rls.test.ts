import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb } from "@/server/db/admin";
import { closeDb } from "@/server/db/client";
import { applicants, applications, auditLog, editions, staffMembers } from "@/server/db/schema";
import { withUserDb, type JwtClaims } from "@/server/db/user";
import { enqueueEmail } from "@/server/messaging/outbox";
import { rateLimit } from "@/server/privileged/rate-limit";

/**
 * Row Level Security checks against the real local database, acting as different users exactly
 * the way the app does (withUserDb). Requires `npx supabase start` and migrations.
 */
const run = randomUUID().slice(0, 8);
const mkUser = (label: string) => ({ id: randomUUID(), email: `${label}-${run}@test.example` });
const alice = mkUser("alice");
const bob = mkUser("bob");
const reviewer = mkUser("reviewer");
const staff = mkUser("staff");
const claims = (u: { id: string; email: string }): JwtClaims => ({ sub: u.id, email: u.email });

/** Drizzle wraps Postgres errors; the database message is on `cause`. */
async function dbError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    const cause = (err as { cause?: { message?: string } }).cause;
    return cause?.message ?? (err as Error).message;
  }
  return "no error";
}

let editionId = "";
let aliceAppId = "";
let bobAppId = "";

beforeAll(async () => {
  const db = adminDb();
  for (const u of [alice, bob, reviewer, staff]) {
    await db.execute(sql`insert into auth.users (id, email, aud, role) values (${u.id}, ${u.email}, 'authenticated', 'authenticated')`);
  }
  await db.insert(staffMembers).values([
    { email: reviewer.email, fullName: "R", roles: ["reviewer"] },
    { email: staff.email, fullName: "S", roles: ["staff"] },
  ]);
  const [e] = await db.insert(editions).values({ slug: `rls-${run}`, name: "RLS test" }).returning();
  editionId = e!.id;
  for (const [u, status] of [
    [alice, "draft"],
    [bob, "submitted"],
  ] as const) {
    const [a] = await db
      .insert(applicants)
      .values({ userId: u.id, email: u.email, emailCanonical: u.email, fullName: u.email, phoneE164: "+919876543210" })
      .returning();
    const [app] = await db.insert(applications).values({ editionId, applicantId: a!.id, formVersion: 1, status }).returning();
    if (u === alice) aliceAppId = app!.id;
    else bobAppId = app!.id;
  }
});

afterAll(async () => {
  const db = adminDb();
  await db.delete(applications).where(eq(applications.editionId, editionId));
  await db.delete(editions).where(eq(editions.id, editionId));
  for (const u of [alice, bob, reviewer, staff]) {
    await db.delete(staffMembers).where(eq(staffMembers.email, u.email));
    await db.execute(sql`delete from auth.users where id = ${u.id}`);
  }
  await closeDb();
});

describe("schema", () => {
  it("every table in the app schema has RLS enabled", async () => {
    const rows = await adminDb().execute<{ relname: string; relrowsecurity: boolean }>(
      sql`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'app' and c.relkind = 'r'`,
    );
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it("the app schema is not exposed to the anon role", async () => {
    const rows = await adminDb().execute<{ ok: boolean }>(sql`select has_schema_privilege('anon', 'app', 'USAGE') as ok`);
    expect(rows[0]?.ok).toBe(false);
  });
});

describe("applicants", () => {
  it("see only their own application", async () => {
    const rows = await withUserDb(claims(alice), (tx) => tx.select({ id: applications.id }).from(applications));
    expect(rows.map((r) => r.id)).toEqual([aliceAppId]);
  });

  it("cannot edit an application once submitted", async () => {
    const updated = await withUserDb(claims(bob), (tx) =>
      tx.update(applications).set({ answers: { x: "changed" } }).where(eq(applications.id, bobAppId)).returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it("cannot promote their own status beyond submitted", async () => {
    const msg = await dbError(
      withUserDb(claims(alice), (tx) => tx.update(applications).set({ status: "selected" }).where(eq(applications.id, aliceAppId))),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it("cannot create an applicant row for someone else's email", async () => {
    await expect(
      withUserDb(claims(alice), (tx) =>
        tx.insert(applicants).values({ userId: alice.id, email: "someone-else@test.example", emailCanonical: "x" }),
      ),
    ).rejects.toThrow();
  });
});

describe("staff roles", () => {
  it("staff can read all applications in the edition", async () => {
    const rows = await withUserDb(claims(staff), (tx) =>
      tx.select({ id: applications.id }).from(applications).where(eq(applications.editionId, editionId)),
    );
    expect(rows).toHaveLength(2);
  });

  it("reviewers cannot read applicant contact details", async () => {
    const rows = await withUserDb(claims(reviewer), (tx) => tx.select().from(applicants));
    expect(rows).toHaveLength(0);
  });

  it("a non-admin cannot grant themselves roles", async () => {
    const updated = await withUserDb(claims(staff), (tx) =>
      tx.update(staffMembers).set({ roles: ["owner"] }).where(eq(staffMembers.email, staff.email)).returning(),
    );
    expect(updated).toHaveLength(0);
  });
});

describe("platform", () => {
  it("audit log is append-only, even for the privileged role", async () => {
    const [row] = await adminDb().insert(auditLog).values({ actorEmail: "test", action: "test", entity: "test" }).returning();
    expect(await dbError(adminDb().update(auditLog).set({ action: "tampered" }).where(eq(auditLog.id, row!.id)))).toMatch(/append-only/);
    expect(await dbError(adminDb().delete(auditLog).where(eq(auditLog.id, row!.id)))).toMatch(/append-only/);
  });

  it("rate limit allows up to the max, then blocks", async () => {
    const subject = `test-${run}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit("magicLinkPerEmail", subject));
    expect(results).toEqual([true, true, true, false]);
  });

  it("outbox idempotency: the same key is only queued once", async () => {
    const msg = {
      idempotencyKey: `test:${run}`,
      to: "nobody@test.example",
      template: "test",
      email: { subject: "s", html: "<p>h</p>", text: "t" },
    };
    expect(await enqueueEmail(msg)).toMatch(/[0-9a-f-]{36}/);
    expect(await enqueueEmail(msg)).toBeNull();
    await adminDb().execute(sql`delete from app.outbound_messages where idempotency_key = ${msg.idempotencyKey}`);
  });
});
