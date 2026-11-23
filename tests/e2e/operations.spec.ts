import { expect, test } from "@playwright/test";
import { cronSecret, currentEditionId, sql } from "./db";
import { signInByEmail, uniqueEmail, waitForEmail } from "./helpers";

const OWNER = "owner-e2e@test.example";

test("outreach: schedule, approve with a personal line, send, and detect a reply", async ({ page, request }) => {
  const editionId = await currentEditionId();
  const tag = Date.now().toString(36);
  const name = `E2E University ${tag}`;
  const contact = `vc-${tag}@example.org`;
  const [org] = await sql<{ id: string }[]>`insert into app.organisations (type, name, import_key, fit_reason) values ('university', ${name}, ${`university:e2e ${tag}`}, 'Strong policy school') returning id`;
  await sql`insert into app.contacts (organisation_id, name, role_title, email, is_primary) values (${org!.id}, 'Dr. Test', 'Vice-Chancellor', ${contact}, true)`;
  await sql`insert into app.partnerships (edition_id, organisation_id, temperature) values (${editionId}, ${org!.id}, 'hot')`;

  await signInByEmail(page, OWNER, "/login");
  await page.goto(`/admin/outreach?q=${encodeURIComponent(name)}`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel(`Select ${name}`).check();
  await page.getByRole("button", { name: "Schedule first email" }).click();
  await expect(page.getByText(/Scheduled 1/)).toBeVisible();

  await page.goto("/admin/outreach/queue");
  const card = page.getByRole("article").filter({ hasText: name });
  await expect(card).toBeVisible();
  await page.waitForLoadState("networkidle");
  await card.getByRole("button", { name: "Approve & send" }).click();
  await expect(card.getByRole("alert")).toContainText(/personal line/i);
  await card.getByLabel("Personal line (required)").fill("Your school's work on district data inspired our Day 1 sessions.");
  await card.getByRole("button", { name: "Approve & send" }).click();
  await expect(page.getByText(/Approved\. Sends from your Gmail/)).toBeVisible();

  // Release the spacing delay and run the sender the way pg_cron would.
  await sql`update app.outbound_messages set not_before = now() where meta ->> 'partnershipId' in (select id::text from app.partnerships where organisation_id = ${org!.id})`;
  const res = await request.get("/api/cron/drain-outbox?trigger=test", { headers: { Authorization: `Bearer ${cronSecret()}` } });
  expect(res.ok()).toBe(true);
  const mail = await waitForEmail(contact, /Hosting Day 1/);
  expect(mail).toContain("Your school's work on district data inspired our Day 1 sessions.");
  expect(mail).toContain('reply "no"');

  const [p] = await sql<{ id: string }[]>`select id from app.partnerships where organisation_id = ${org!.id}`;
  await page.goto(`/admin/outreach/${p!.id}`);
  await expect(page.getByText("Email sent").first()).toBeVisible();
  await page.getByLabel("Reply text").fill("Happy to discuss, please call my office.");
  await page.getByRole("button", { name: "Simulate" }).click();
  await expect(page.getByText("In discussion").first()).toBeVisible();
});

test("reviewer sees anonymised applications only and can score them", async ({ page }) => {
  const editionId = await currentEditionId();
  const reviewer = uniqueEmail("reviewer");
  const [app] = await sql<{ id: string; name: string }[]>`
    select a.id, ap.full_name as name from app.applications a join app.applicants ap on ap.id = a.applicant_id
    where a.edition_id = ${editionId} and a.status <> 'draft' and ap.full_name is not null limit 1`;
  await sql`insert into app.staff_members (email, full_name, roles) values (${reviewer}, 'E2E Reviewer', '{reviewer}')`;
  await sql`insert into app.rubrics (edition_id, criteria) values (${editionId}, ${sql.json([{ key: "motivation", label: "Motivation", weight: 1, max: 5 }, { key: "problem", label: "Problem", weight: 2, max: 5 }])}) on conflict (edition_id) do nothing`;
  const [assignment] = await sql<{ id: string }[]>`insert into app.review_assignments (application_id, reviewer_email) values (${app!.id}, ${reviewer}) returning id`;

  await signInByEmail(page, reviewer, "/login");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/reviews$/);
  await page.goto(`/admin/reviews/${assignment!.id}`);
  await expect(page.getByRole("heading", { name: /Application #/ })).toBeVisible();
  await expect(page.getByText(app!.name)).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  const [rubric] = await sql<{ criteria: { key: string }[] }[]>`select criteria from app.rubrics where edition_id = ${editionId}`;
  for (const c of rubric!.criteria) await page.locator(`input[name="${c.key}"][value="4"]`).check({ force: true });
  await page.getByRole("button", { name: /Save/ }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.goto("/admin/applications");
  await expect(page).toHaveURL(/\/forbidden$/);
});

test("event check-in by name marks a fellow as attended", async ({ page }) => {
  const editionId = await currentEditionId();
  const email = uniqueEmail("fellow");
  const fellowName = `Checkin Fellow ${Date.now().toString(36)}`;
  const [a] = await sql<{ id: string }[]>`insert into app.applicants (email, email_canonical, full_name, college) values (${email}, ${email}, ${fellowName}, 'E2E College') returning id`;
  const [app] = await sql<{ id: string }[]>`insert into app.applications (edition_id, applicant_id, form_version, status, submitted_at) values (${editionId}, ${a!.id}, 1, 'confirmed', now()) returning id`;

  await signInByEmail(page, OWNER, "/login");
  await page.goto("/admin/event/checkin");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("No pass? Find by name").fill(fellowName.slice(0, 12));
  await page.getByRole("button", { name: new RegExp(fellowName) }).click();
  await expect(page.getByRole("status")).toContainText(`✓ ${fellowName}`);
  const [row] = await sql<{ status: string }[]>`select status from app.applications where id = ${app!.id}`;
  expect(row!.status).toBe("attended");
});

test("ambassador signs up, is approved, and gets a link and QR code", async ({ browser }) => {
  const ambCtx = await browser.newContext();
  const amb = await ambCtx.newPage();
  const email = uniqueEmail("amb");
  const name = `Riya ${Date.now().toString(36)}`;
  await signInByEmail(amb, email, "/en/ambassadors/join");
  await amb.getByLabel("Your full name").fill(name);
  await amb.getByLabel("College or university").fill("E2E College");
  await amb.getByRole("button", { name: "Apply to be an ambassador" }).click();
  await expect(amb.getByText("Thanks for applying")).toBeVisible();

  const staffCtx = await browser.newContext();
  const staff = await staffCtx.newPage();
  await signInByEmail(staff, OWNER, "/login");
  await staff.goto("/admin/ambassadors");
  const row = staff.getByRole("listitem").filter({ hasText: name });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(staff.getByRole("cell", { name: new RegExp(name) })).toBeVisible();

  await waitForEmail(email, /campus ambassador/i);
  await amb.goto("/en/ambassador");
  await expect(amb.getByRole("heading", { name: "Your referral link" })).toBeVisible();
  await expect(amb.getByText(/\/r\/AMB-RIYA-/)).toBeVisible();
  await expect(amb.getByRole("img", { name: "QR code for your referral link" })).toBeVisible();
});
