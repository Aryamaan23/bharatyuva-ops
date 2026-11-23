import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;

/**
 * End-to-end tests run against a production build on port 3100, using the local Supabase stack
 * (npx supabase start) and Mailpit to read emails. Nothing leaves the machine.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/en`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_APP_URL: BASE_URL,
      // No Turnstile in tests: verifyTurnstile() passes when no secret is configured outside production.
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      TURNSTILE_SECRET_KEY: "",
      OWNER_EMAILS: "owner-e2e@test.example",
      MESSAGE_MODE: "live",
      EMAIL_TRANSPORT: "smtp",
    },
  },
});
