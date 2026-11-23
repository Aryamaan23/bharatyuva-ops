import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { randomPhone, signInByEmail, uniqueEmail, waitForEmail } from "./helpers";

test.describe("public site", () => {
  test("landing page works in English and Hindi with no accessibility violations", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Three days");
    await expect(page.getByRole("link", { name: "Apply now" }).first()).toBeVisible();
    const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(a11y.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

    for (const path of ["/en/apply", "/en/privacy", "/hi/data-request", "/hi/apply"]) {
      await page.goto(path);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(result.violations.map((v) => `${path} ${v.id}: ${v.help}`)).toEqual([]);
    }

    await page.goto("/en");
    await page.getByRole("link", { name: "हिन्दी" }).click();
    await expect(page).toHaveURL(/\/hi$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  });
});

test("an applicant can apply, get a confirmation email, and see their status", async ({ page }) => {
  const email = uniqueEmail("applicant");
  await signInByEmail(page, email, "/en/apply");
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();

  // Validation: moving on with empty required fields shows an error summary.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Please fix the highlighted answers")).toBeVisible();

  await page.getByLabel(/^Full name/).fill("Asha Verma");
  await page.getByLabel(/^Mobile number/).fill(randomPhone());
  await page.getByLabel(/^Date of birth/).fill("2003-05-17");
  await page.getByLabel(/^State or union territory/).fill("Rajasthan");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Education" })).toBeVisible();
  await page.getByLabel(/^College, university/).fill("Government College, Dholpur");
  await page.getByLabel(/^Course and year/).fill("BA Economics, 2nd year");
  await page.getByLabel("Social sciences / humanities").check();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Your ideas" })).toBeVisible();
  await page.getByLabel(/^Why do you want to join/).fill("I want to understand how district administrations deliver schemes.");
  await page.getByLabel(/^Describe a public problem/).fill("Water supply in my town is irregular. I would first map complaints by ward.");
  await expect(page.getByText(/\/ 300 words/)).toBeVisible();
  // Draft autosave
  await expect(page.getByRole("status")).toContainText(/draft saved/i, { timeout: 10_000 });
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Consent and declarations" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText(/You must agree/)).toBeVisible();
  await page.getByLabel(/I agree to Beyond the Classroom processing/).check();
  await page.getByLabel("I am 18 years of age or older.").check();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Check and submit" })).toBeVisible();
  await expect(page.getByText("Government College, Dholpur")).toBeVisible();
  await page.getByRole("button", { name: "Submit application" }).click();

  await expect(page).toHaveURL(/\/en\/apply\/submitted$/);
  const confirmation = await waitForEmail(email, /received your application/);
  expect(confirmation).toContain("Asha Verma");

  await page.goto("/en/me");
  await expect(page.getByRole("heading", { name: /Status: Submitted/ })).toBeVisible();

  // Returning to /apply after submitting doesn't reopen the form.
  await page.goto("/en/apply");
  await expect(page.getByText(/already submitted/)).toBeVisible();
});

test("an under-18 applicant's guardian receives a consent request", async ({ page }) => {
  const email = uniqueEmail("minor");
  const guardian = uniqueEmail("guardian");
  await signInByEmail(page, email, "/en/apply");
  await page.getByLabel(/^Full name/).fill("Ravi Kumar");
  await page.getByLabel(/^Mobile number/).fill(randomPhone());
  await page.getByLabel(/^Date of birth/).fill("2010-01-10");
  await page.getByLabel(/^State or union territory/).fill("Bihar");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/^College, university/).fill("Model School, Patna");
  await page.getByLabel(/^Course and year/).fill("Class 12");
  await page.getByLabel("Other").check();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/^Why do you want to join/).fill("Curious about policy.");
  await page.getByLabel(/^Describe a public problem/).fill("Roads flood every monsoon.");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel(/I agree to Beyond the Classroom processing/).check();
  await page.getByLabel(/I am under 18/).check();
  await page.getByLabel("Parent or guardian's full name").fill("Sunita Kumar");
  await page.getByLabel("Parent or guardian's email").fill(guardian);
  await page.getByLabel("Relationship to you").fill("Mother");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page).toHaveURL(/submitted$/);

  const body = await waitForEmail(guardian, /consent/i);
  const link = body.match(/https?:\/\/[^\s"<>]+\/en\/guardian\/[A-Za-z0-9_-]+/)?.[0];
  expect(link).toBeTruthy();
  await page.goto(new URL(link!).pathname);
  await page.getByLabel(/I am .* parent or legal guardian/).check();
  await page.getByRole("button", { name: "Give consent" }).click();
  await expect(page.getByText("Your consent has been recorded")).toBeVisible();
});
