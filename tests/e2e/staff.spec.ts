import { expect, test } from "@playwright/test";
import { randomPhone, signInByEmail, uniqueEmail, waitForEmail } from "./helpers";

test("staff select an applicant, the applicant accepts the seat", async ({ browser }) => {
  // Applicant submits a minimal application.
  const applicantCtx = await browser.newContext();
  const applicant = await applicantCtx.newPage();
  const email = uniqueEmail("selected");
  await signInByEmail(applicant, email, "/en/apply");
  await applicant.getByLabel(/^Full name/).fill("Meera Iyer");
  await applicant.getByLabel(/^Mobile number/).fill(randomPhone());
  await applicant.getByLabel(/^Date of birth/).fill("2002-08-01");
  await applicant.getByLabel(/^State or union territory/).fill("Tamil Nadu");
  await applicant.getByRole("button", { name: "Next" }).click();
  await applicant.getByLabel(/^College, university/).fill("Madras Christian College");
  await applicant.getByLabel(/^Course and year/).fill("MA Public Policy");
  await applicant.getByLabel("Social sciences / humanities").check();
  await applicant.getByRole("button", { name: "Next" }).click();
  await applicant.getByLabel(/^Why do you want to join/).fill("To learn from practitioners.");
  await applicant.getByLabel(/^Describe a public problem/).fill("Late scholarship disbursal.");
  await applicant.getByRole("button", { name: "Next" }).click();
  await applicant.getByLabel(/I agree to Beyond the Classroom processing/).check();
  await applicant.getByLabel("I am 18 years of age or older.").check();
  await applicant.getByRole("button", { name: "Next" }).click();
  await applicant.getByRole("button", { name: "Submit application" }).click();
  await expect(applicant).toHaveURL(/submitted$/);

  // Owner signs in (OWNER_EMAILS bootstrap) and selects them.
  const staffCtx = await browser.newContext();
  const staff = await staffCtx.newPage();
  await signInByEmail(staff, "owner-e2e@test.example", "/login");
  await expect(staff).toHaveURL(/\/admin$/);
  await expect(staff.getByRole("heading", { name: "Bharat Yuva 2.0" })).toBeVisible();

  await staff.goto(`/admin/applications?q=${encodeURIComponent(email)}`);
  await staff.getByRole("link", { name: "Meera Iyer" }).click();
  // Wait for hydration so React doesn't reset the select after we change it.
  await staff.waitForLoadState("networkidle");
  await staff.getByLabel("Status").selectOption("selected");
  await staff.getByLabel("Email the applicant").check();
  await staff.getByRole("button", { name: "Update status" }).click();
  await expect(staff.getByText(/Offer expires/)).toBeVisible();

  await waitForEmail(email, /selected/i);
  await applicant.goto("/en/me");
  await expect(applicant.getByRole("heading", { name: /Status: Selected/ })).toBeVisible();
  await applicant.getByRole("button", { name: "Accept my seat" }).click();
  await expect(applicant.getByRole("heading", { name: /Status: Seat confirmed/ })).toBeVisible();
  await waitForEmail(email, /seat is confirmed/);

  // The change is in the audit log.
  await staff.goto("/admin/audit?entity=application");
  await expect(staff.getByText("application.seat_accepted").first()).toBeVisible();

  // A signed-in applicant without a staff role is kept out of /admin.
  await applicant.goto("/admin");
  await expect(applicant).toHaveURL(/\/forbidden$/);
});
