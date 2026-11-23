import { expect, test } from "@playwright/test";
import { sql } from "./db";
import { signInByEmail } from "./helpers";

const ADMIN_PAGES = [
  "/admin",
  "/admin/outreach",
  "/admin/outreach/queue",
  "/admin/outreach/import",
  "/admin/outreach/templates",
  "/admin/tasks",
  "/admin/tasks?filter=all",
  "/admin/applications",
  "/admin/selection",
  "/admin/selection/rubric",
  "/admin/selection/interviews",
  "/admin/ambassadors",
  "/admin/event",
  "/admin/event/teams",
  "/admin/event/run-of-show",
  "/admin/event/checkin",
  "/admin/event/attendance",
  "/admin/event/feedback",
  "/admin/event/certificates",
  "/admin/event/submissions",
  "/admin/event/compendium",
  "/admin/event/impact",
  "/admin/editions",
  "/admin/team",
  "/admin/data-requests",
  "/admin/audit",
  "/admin/settings/gmail",
  "/admin/health",
];

test("every staff page loads without a server error", async ({ page }) => {
  test.setTimeout(120_000);
  await signInByEmail(page, "owner-e2e@test.example", "/login");
  const [p] = await sql<{ id: string }[]>`select id from app.partnerships limit 1`;
  const [e] = await sql<{ id: string }[]>`select id from app.editions where is_current limit 1`;
  const pages = [...ADMIN_PAGES, ...(p ? [`/admin/outreach/${p.id}`] : []), ...(e ? [`/admin/editions/${e.id}`, `/admin/editions/${e.id}/form`] : [])];
  for (const path of pages) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
    await expect(page.getByText(/Application error|Internal Server Error/i), path).toHaveCount(0);
  }
});

test("public pages load", async ({ page }) => {
  for (const path of ["/en", "/hi", "/en/apply", "/en/me", "/en/privacy", "/en/data-request", "/en/ambassadors/join", "/en/ambassador", "/hi/feedback/1", "/verify/BY27-AAAA-AAAA"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
  }
});
