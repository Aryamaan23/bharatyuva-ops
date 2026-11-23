import { expect, type Page } from "@playwright/test";
import { sql } from "./db";

const MAILPIT = "http://127.0.0.1:54324";

type MailpitSummary = { ID: string; Subject: string; Created: string };

/** Wait for the newest email to `to` whose subject matches, and return its text body. */
export async function waitForEmail(to: string, subject: RegExp, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const data = (await res.json()) as { messages: MailpitSummary[] };
    const hit = data.messages.find((m) => subject.test(m.Subject));
    if (hit) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { Text: string; HTML: string };
      return `${msg.Text}\n${msg.HTML}`;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${to} matching ${subject}`);
}

/** Sign in with the emailed magic link (rewritten to the test server's origin). */
export async function signInByEmail(page: Page, email: string, startPath: string) {
  // Tests sign the same people in many times; reset our per-email/IP limits first, and respect
  // Supabase's one-link-per-second-per-address rule.
  await sql`delete from app.rate_limits`;
  await new Promise((r) => setTimeout(r, 1200));
  await page.goto(startPath);
  await page.getByLabel(/email address|^email$/i).first().fill(email);
  await page.getByRole("button", { name: /email me a sign-in link|send/i }).click();
  await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
  const body = await waitForEmail(email, /sign-in link|confirm your email/i);
  const link = body.match(/https?:\/\/[^\s"<>]+\/auth\/confirm\?[^\s"<>]+/)?.[0];
  expect(link, "magic link in email").toBeTruthy();
  const url = new URL(link!.replace(/&amp;/g, "&"));
  const next = new URL(url.searchParams.get("next") ?? startPath, page.url());
  url.searchParams.set("next", next.pathname);
  await page.goto(`${new URL(page.url()).origin}${url.pathname}${url.search}`);
}

export function uniqueEmail(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.example`;
}

/** A valid Indian mobile number, different each run (so duplicate detection doesn't trigger). */
export function randomPhone() {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
}
