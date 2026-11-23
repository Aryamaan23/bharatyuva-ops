/**
 * Development seed: FAKE data only. Never point this at production.
 *   npm run db:seed            (uses DATABASE_URL from .env)
 * Creates the current edition with applications open, the default form, consent texts, a staff
 * owner for OWNER_EMAILS, and ~60 fake applicants across states and statuses.
 */
import "dotenv/config";
import { fakerEN_IN as faker } from "@faker-js/faker";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { canonicalEmail } from "../src/lib/contact";
import { DEFAULT_FORM } from "../src/lib/forms/default-form";
import * as schema from "../src/server/db/schema";
import { bootstrapContent } from "../src/server/bootstrap";
import { DEFAULT_TIMELINE } from "../src/content/timeline";
import { planTimeline } from "../src/server/domain/timeline";

const url = process.env.DATABASE_URL ?? "";
if (/supabase\.co|pooler\.supabase\.com/.test(url) && process.env.ALLOW_REMOTE_SEED !== "yes") {
  console.error("Refusing to seed a hosted Supabase database. Set ALLOW_REMOTE_SEED=yes for a staging project.");
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const db = drizzle(client, { schema, casing: "snake_case" });

const STATES = ["Delhi", "Haryana", "Rajasthan", "Uttar Pradesh", "Maharashtra", "Karnataka", "Bihar", "West Bengal", "Tamil Nadu", "Punjab", "Gujarat", "Assam", "Kerala", "Madhya Pradesh"];
const SOURCES = [undefined, "instagram", "linkedin", "unstop", "whatsapp", "internshala"];
const STATUSES = ["draft", "submitted", "submitted", "submitted", "under_review", "shortlisted", "selected", "waitlisted", "rejected", "confirmed"] as const;

faker.seed(2027);

async function main() {
  const days = (n: number) => new Date(Date.now() + n * 86_400_000);
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);

  await db.execute(sql`truncate app.applications, app.applicants, app.form_definitions, app.editions, app.consent_versions, app.outbound_messages, app.job_runs, app.organisations, app.email_templates, app.task_templates, app.short_links cascade`);
  await bootstrapContent(db);

  const [edition] = await db
    .insert(schema.editions)
    .values({
      slug: "bharat-yuva-2",
      name: "Bharat Yuva 2.0",
      status: "applications",
      isCurrent: true,
      day1Date: isoDate(days(90)),
      day2Date: isoDate(days(91)),
      day3Date: isoDate(days(92)),
      venues: { day1: { name: "Partner university (to be confirmed)", city: "Gurugram" } },
      applicationsOpenAt: days(-10),
      applicationsCloseAt: days(30),
      contactEmail: "team@example.org",
      postSelectionDocuments: [
        { key: "id_proof", label: { en: "Government photo ID", hi: "सरकारी फ़ोटो पहचान पत्र" }, required: true },
        { key: "college_letter", label: { en: "College ID or bonafide letter", hi: "कॉलेज आईडी या बोनाफ़ाइड पत्र" }, required: false },
      ],
    })
    .returning();

  await db.insert(schema.formDefinitions).values({ editionId: edition!.id, version: 1, definition: DEFAULT_FORM, publishedAt: new Date(), createdBy: "seed" });
  const consents = await db.select().from(schema.consentVersions);
  const processing = consents.find((c) => c.kind === "processing")!;

  for (const email of (process.env.OWNER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)) {
    await db
      .insert(schema.staffMembers)
      .values({ email, fullName: email.split("@")[0]!, roles: ["owner"], phone: "+91 90000 00000" })
      .onConflictDoNothing();
  }
  await db
    .insert(schema.staffMembers)
    .values([
      { email: "volunteer@example.org", fullName: "Demo Volunteer", roles: ["staff"] },
      { email: "reviewer@example.org", fullName: "Demo Reviewer", roles: ["reviewer"] },
    ])
    .onConflictDoNothing();

  for (let i = 0; i < 60; i++) {
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    const email = faker.internet.email({ firstName: first, lastName: last, provider: "example.com" }).toLowerCase();
    const state = faker.helpers.arrayElement(STATES);
    const college = `${faker.helpers.arrayElement(["Government", "St.", "National", "Central", "City"])} ${faker.helpers.arrayElement(["College", "University", "Institute of Technology", "Law School"])}, ${faker.location.city()}`;
    const status = faker.helpers.arrayElement(STATUSES);
    const phone = `+91${faker.helpers.arrayElement(["9", "8", "7"])}${faker.string.numeric(9)}`;
    const dob = isoDate(faker.date.birthdate({ min: 18, max: 26, mode: "age" }));
    const [applicant] = await db
      .insert(schema.applicants)
      .values({
        email,
        emailCanonical: canonicalEmail(email),
        phoneE164: status === "draft" ? null : phone,
        fullName: status === "draft" ? null : `${first} ${last}`,
        dateOfBirth: status === "draft" ? null : dob,
        state: status === "draft" ? null : state,
        college: status === "draft" ? null : college,
      })
      .returning();
    const submittedAt = status === "draft" ? null : faker.date.recent({ days: 9 });
    const [app] = await db
      .insert(schema.applications)
      .values({
        editionId: edition!.id,
        applicantId: applicant!.id,
        formVersion: 1,
        status,
        submittedAt,
        currentStep: status === "draft" ? faker.number.int({ min: 0, max: 2 }) : 3,
        attribution: { source: faker.helpers.arrayElement(SOURCES) },
        referralCode: faker.datatype.boolean(0.15) ? `AMB-${faker.string.alphanumeric(4).toUpperCase()}` : null,
        seatOfferExpiresAt: status === "selected" ? days(3) : null,
        answers: {
          full_name: `${first} ${last}`,
          phone,
          date_of_birth: dob,
          state,
          college,
          course: `${faker.helpers.arrayElement(["BA", "BSc", "BTech", "LLB", "MA"])} ${faker.helpers.arrayElement(["Economics", "Political Science", "Computer Science", "Law", "Sociology"])}`,
          discipline: faker.helpers.arrayElement(["social_sciences", "law", "stem", "commerce", "other"]),
          why_bharat_yuva: faker.lorem.paragraph({ min: 3, max: 6 }),
          policy_problem: faker.lorem.paragraphs(2),
        },
      })
      .returning();
    if (submittedAt) {
      await db.insert(schema.consentRecords).values({ applicantId: applicant!.id, applicationId: app!.id, consentVersionId: processing.id, granted: true, recordedAt: submittedAt });
    }
  }
  // Fake partners (example.org addresses, never real contacts) across types and stages.
  const owner = (process.env.OWNER_EMAILS ?? "").split(",")[0]?.trim().toLowerCase() || null;
  const fakeOrgs = [
    ...["Example Institute of Public Policy", "Sample University School of Governance", "Demo College of Law", "Placeholder Technical University"].map((n, i) => ({ type: "university" as const, name: n, temp: (["hot", "warm", "cold", "cold"] as const)[i]! })),
    ...["Exampur District", "Sampleganj District", "Demonagar District", "Testabad District"].map((n, i) => ({ type: "district" as const, name: n, temp: (["hot", "warm", "warm", "cold"] as const)[i]! })),
    ...["Embassy of Exampleland", "High Commission of Sampleia", "Delegation of Demoria"].map((n, i) => ({ type: "embassy" as const, name: n, temp: (["warm", "cold", "cold"] as const)[i]! })),
  ];
  const stages = ["not_contacted", "not_contacted", "email_sent", "in_discussion", "not_contacted", "follow_up_1", "not_contacted", "confirmed", "not_contacted", "not_contacted", "declined"] as const;
  for (const [i, o] of fakeOrgs.entries()) {
    const slug = o.name.toLowerCase().replace(/[^a-z]+/g, "-");
    const [org] = await db
      .insert(schema.organisations)
      .values({
        type: o.type,
        name: o.name,
        importKey: `${o.type}:${o.name.toLowerCase()}`,
        location: faker.helpers.arrayElement(STATES),
        fitReason: faker.lorem.sentence(),
        suggestedApproach: faker.lorem.sentence(),
        needsVerification: o.type === "district" && i % 2 === 0,
        verificationNote: o.type === "district" && i % 2 === 0 ? "Fake data: re-confirm before sending" : "Fake data",
      })
      .returning();
    if (i !== 10) {
      await db.insert(schema.contacts).values({ organisationId: org!.id, name: i % 3 === 0 ? `Dr. ${faker.person.fullName()}` : null, roleTitle: o.type === "district" ? "District Collector" : "Director", email: `${slug}@example.org`, isPrimary: true });
    }
    await db.insert(schema.partnerships).values({ editionId: edition!.id, organisationId: org!.id, stage: stages[i]!, temperature: o.temp, ownerEmail: i < 6 ? owner : null, pastPartner: i === 0 });
  }
  for (const t of planTimeline(isoDate(days(90)), DEFAULT_TIMELINE)) {
    await db.insert(schema.tasks).values({ editionId: edition!.id, title: t.title, kind: "timeline", dueAt: t.dueAt, offsetDays: t.offsetDays, ownerEmail: owner, sourceKey: `timeline:${t.offsetDays}:${t.title}` });
  }
  await db
    .update(schema.editions)
    .set({ posterUrls: { general: "https://example.org/poster-general.pdf", university: "https://example.org/poster-university.pdf", district: "https://example.org/poster-district.pdf", embassy: "https://example.org/poster-embassy.pdf" } })
    .where(sql`id = ${edition!.id}`);
  console.log(`Seeded edition ${edition!.name} with 60 fake applicants and ${fakeOrgs.length} fake partners.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
