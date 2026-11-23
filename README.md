# Bharat Yuva Platform

Operations platform for **Bharat Yuva**, the three-day public policy fellowship run by Beyond the Classroom:
public site and applications (English/Hindi), applicant portal, partner outreach CRM with Gmail sending,
selection with anonymous reviewing, campus ambassadors, event-day check-in, certificates, compendium and
impact reporting.

- Plan and architecture: [`docs/PLAN.md`](docs/PLAN.md)
- Running an edition day to day: [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
- Data protection: [`docs/PRIVACY.md`](docs/PRIVACY.md)
- Status: **all four phases built and tested locally; not yet deployed.** See [What's built](#whats-built) and [Known limitations](#known-limitations).

## Stack

Next.js 16 (App Router, TypeScript strict) on Vercel · Supabase (Postgres, Auth, Storage) · Drizzle ORM ·
Tailwind CSS 4 + shadcn/ui · Resend (applicant email) · Vitest + Playwright · Sentry.

## Local development

Prerequisites: Node 22+ (24 recommended), Docker Desktop running.

```bash
npm install
npx supabase start            # Postgres, Auth, Storage, Mailpit in Docker (first run pulls images)
cp .env.example .env.local    # then fill the values below
cp .env.local .env            # drizzle-kit and scripts read .env
npm run db:migrate            # apply migrations in drizzle/
npm run db:seed               # FAKE edition, form, consent texts and 60 fake applicants
npm run dev                   # http://localhost:3000
```

Fill `.env.local` with:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from `npx supabase status -o env` (`ANON_KEY`, `SERVICE_ROLE_KEY`)
- `CRON_SECRET`, `HASH_SALT`, `TOKEN_SIGNING_SECRET`: each `openssl rand -hex 32`
- `OWNER_EMAILS`: your email. You become an owner the first time you sign in at `/login`.

Useful local URLs:

| URL | What |
|---|---|
| http://localhost:3000/en | Public site (`/hi` for Hindi) |
| http://localhost:3000/en/apply | Application form (sign in with any email; the link arrives in Mailpit) |
| http://localhost:3000/en/me | Applicant portal |
| http://localhost:3000/login → /admin | Staff app |
| http://127.0.0.1:54324 | **Mailpit**: every email the app sends locally |
| http://127.0.0.1:54323 | Supabase Studio |

Locally, email goes over SMTP to Mailpit and never leaves your machine.

### Common commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests + database (RLS) tests against local Supabase |
| `npm run e2e` | Playwright end-to-end tests (builds and serves on :3100, reads mail from Mailpit) |
| `npm run db:generate` | Create a migration after editing `src/server/db/schema/*` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Reset and seed fake data (refuses to run against hosted Supabase) |
| `npm run db:reset` | Wipe the local database, migrate, seed |

## Environment variables

Every variable is documented in [`.env.example`](.env.example) and validated at runtime by
`src/lib/env.ts`. Summary:

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | all | Public base URL used in emails and auth redirects |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | Supabase project (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Storage signed URLs, Auth admin (deleting users on request) |
| `DATABASE_URL` | server | App connection. **Vercel: Supavisor transaction pooler, port 6543** |
| `MIGRATION_DATABASE_URL` | CI | Direct/session connection for `drizzle-kit migrate` |
| `CRON_SECRET` | server | Bearer token required by `/api/cron/*` |
| `HASH_SALT`, `TOKEN_SIGNING_SECRET` | server | Hashing IPs/emails; signing tokens |
| `OWNER_EMAILS` | server | Bootstrap owners (comma-separated) |
| `MESSAGE_MODE` | server | `log` \| `redirect` \| `live`. **`live` only takes effect when `VERCEL_ENV=production`** |
| `TEST_INBOX` | server | Where all mail goes in `redirect` mode (previews) |
| `EMAIL_TRANSPORT` | server | `smtp` (local Mailpit) or `resend` |
| `EMAIL_FROM`, `EMAIL_REPLY_TO`, `RESEND_API_KEY`, `RESEND_DAILY_CAP` | server | Applicant email via Resend |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | all / server | Cloudflare Turnstile on public forms |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | all / CI | Error monitoring |
| `RESEND_WEBHOOK_SECRET` | server | Verifies Resend delivery/bounce webhooks (`/api/webhooks/resend`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | server | Google OAuth client for staff Gmail (redirect `<APP_URL>/api/gmail/callback`) |
| `GMAIL_TOKEN_KEY` | server | 32-byte base64 key encrypting stored Gmail refresh tokens |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | server | AI drafting/summaries only, default `claude-sonnet-5-5` (server-side refusal fallback on) |
| `FEATURE_WHATSAPP`, `WHATSAPP_PROVIDER`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | server | WhatsApp template messages to opted-in applicants; off by default, console-only outside production |
| `NEXT_PUBLIC_HINDI_ENABLED` | all | Show the Hindi switch in production (after native-speaker review) |

### Never emailing real people from dev or preview

All mail goes through the outbox (`app.outbound_messages`). `src/server/messaging/delivery.ts` decides
where each message actually goes, and it is unit-tested:

- **Local:** SMTP to Mailpit (it can't leave the machine).
- **Preview/staging:** set `MESSAGE_MODE=redirect` and `TEST_INBOX=…`. Every message goes to the test inbox, with the real recipient shown in the subject. Even if `live` is set by mistake, it is downgraded to `redirect` outside production.
- **Production:** `MESSAGE_MODE=live`.

## Architecture in brief

- **Data lives in the `app` Postgres schema, which isn't exposed through Supabase's Data API.** Browsers can't
  query tables with their JWT at all; everything goes through our server.
- **RLS is enforced on our own server code too.** User-facing queries run inside `withUserDb()`
  (`src/server/db/user.ts`), which sets the JWT claims and switches to the `authenticated` role for the
  transaction. `adminDb()` bypasses RLS and ESLint only allows it in `src/server/{jobs,messaging,privileged}`.
  Every table has RLS; `tests/db/rls.test.ts` fails CI otherwise.
- **Outbox:** every message has a unique idempotency key, so jobs and retries can never double-send.
  Failed sends retry with backoff (1 m, 5 m, 30 m, 2 h, 12 h), then show up on `/admin/health`.
- **Audit log** (`app.audit_log`) is append-only at the database level (a trigger rejects UPDATE/DELETE).
- **i18n:** typed dictionaries in `src/i18n/dictionaries`. `hi.ts` must have exactly the same shape as
  `en.ts` (TypeScript + a test enforce it). Hindi is hidden in production until `hi.reviewed = true`.
- **Forms:** each edition's form is versioned JSON (`app.form_definitions`). Publishing creates a new version;
  applicants keep the version they started on.

```
src/
  app/(site)/[locale]/…   public site, apply, portal, ambassadors, feedback, privacy, data requests (EN/HI)
  app/(staff)/…           /login, /admin/* (dashboard, outreach, tasks, applications, selection,
                          reviews, ambassadors, event & after, editions, team, audit, health)
  app/(partner)/…         private partner pages, certificate verification
  app/api/cron/[job]      scheduled jobs (CRON_SECRET)
  app/api/gmail/*         staff Gmail OAuth
  app/api/webhooks/*      Resend and WhatsApp webhooks (signature-checked)
  app/auth/*              magic-link + OAuth callbacks, sign-out
  components/             site/, apply/, portal/, admin/, outreach/, selection/, event/, ui/ (shadcn)
  content/                privacy notice, outreach templates, timeline, organisation details
  i18n/                   dictionaries + loader
  lib/                    shared pure logic (forms, contact normalisation, attribution, env)
  server/
    db/                   Drizzle schema, withUserDb, adminDb
    auth/                 Supabase clients, session + role guards, auth actions
    applications/         applicant + staff services and server actions (RLS)
    outreach/, selection/, event/, tasks/, editions/   staff services and actions (RLS)
    privileged/           RLS-bypassing services with explicit ownership checks
    messaging/            outbox, delivery rules, email/Gmail/WhatsApp senders, templates
    gmail/, whatsapp/, ai/, pdf/   integrations and document rendering
    jobs/                 job runner + registry
    domain/               pure logic (sequences, replies, import rules, assignment, scoring,
                          waitlist, teams, passes, reminders…), all unit-tested
drizzle/                  SQL migrations (versioned)
tests/unit, tests/db, tests/e2e
```

## Scheduled jobs and Vercel Hobby limits

On the **Hobby** plan, Vercel Cron jobs run **at most once a day**, and only roughly within the scheduled
hour. Daily jobs use Vercel Cron; frequent jobs are triggered by **Supabase pg_cron + pg_net** calling the
same protected route (set up once with `supabase/snippets/schedule-cron.sql`).

| Job | What | Trigger | Schedule |
|---|---|---|---|
| `morning` | Due "call the office" tasks, staff digests, monthly retention sweep, drain | Vercel | `0 3 * * *` (08:30 IST) |
| `evening` | Draft reminders, seat reminders/expiry, waitlist offers, feedback emails, drain | Vercel | `30 12 * * *` (18:00 IST) |
| `weekly` | Ambassador progress, owners' summary | Vercel | `30 3 * * 1` (Mon 09:00 IST) |
| `drain-outbox` | Send queued email, Gmail outreach (spaced), WhatsApp | pg_cron every 5 min 09:00–19:00 IST + Vercel daily | |
| `replies` | Gmail reply / opt-out / bounce detection | pg_cron hourly 07:00–23:00 IST | |

Messages triggered by a person (confirmations, decisions, approvals) are also delivered right after the
request via `after()`. Every run is recorded in `app.job_runs` and shown at `/admin/health`.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/evening?trigger=manual"
```

## Deploying

1. **GitHub:** push this repo; protect `main` (require the CI check). Create environments `staging` and `production` (add required reviewers to `production`) with secrets `MIGRATION_DATABASE_URL` (both) and `BACKUP_DATABASE_URL` (production), and the repo variable `BACKUP_AGE_RECIPIENT` (RUNBOOK §9).
2. **Supabase:** two projects (`bharatyuva-staging`, `bharatyuva-prod`) in **Mumbai (ap-south-1)**. For each:
   - Auth → URL configuration: site URL and redirect URLs (`https://<domain>/**`; for staging also the Vercel preview pattern).
   - Auth → SMTP: Resend SMTP (otherwise magic links are limited to ~2/hour).
   - Auth → Email templates → Magic link: paste `supabase/templates/magic_link.html`.
   - Auth → Providers → Google: the same Google OAuth client (for staff sign-in).
   - Database → Extensions: enable `pg_cron` and `pg_net`, then run `supabase/snippets/schedule-cron.sql`.
   - Migrate and load starting content: `MIGRATION_DATABASE_URL=… npx drizzle-kit migrate && MIGRATION_DATABASE_URL=… npx tsx scripts/bootstrap.ts`.
3. **Google Cloud:** project → OAuth consent screen (External, app name "Bharat Yuva Ops", publishing status *In production*, unverified is fine for < 100 users) → Credentials → OAuth client (Web). Authorised redirect URIs: `https://<domain>/api/gmail/callback` and the Supabase callback for staff sign-in. Enable the **Gmail API**. Scopes and why are listed on the in-app Gmail page and in `src/server/gmail/oauth.ts`.
4. **Vercel:** import the repo (region `bom1` from `vercel.json`). Environment variables per environment: Preview → staging Supabase, `MESSAGE_MODE=redirect`, `TEST_INBOX`; Production → prod Supabase, `MESSAGE_MODE=live`. Crons in `vercel.json` are picked up automatically.
5. **Domain and email DNS** (once the BtC subdomain is chosen): Vercel CNAME; Resend's SPF (TXT), DKIM (3 CNAMEs) and DMARC (`_dmarc.<subdomain>` TXT `v=DMARC1; p=quarantine; rua=mailto:…`).
6. **Webhooks:** Resend → `https://<domain>/api/webhooks/resend` (delivered, bounced, complained) → `RESEND_WEBHOOK_SECRET`. WhatsApp (when chosen) → `https://<domain>/api/webhooks/whatsapp` with `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_APP_SECRET`.
7. **Turnstile** widget for the domain; **Sentry** Next.js project.
8. Sign in at `/login` with an address in `OWNER_EMAILS`, add the team, import the partner spreadsheet.

## What's built

**Phase 1: foundation and applications.** Editions; versioned form builder (EN/HI); landing page; magic-link/code sign-in with Turnstile and rate limits; multi-step form with autosave; DPDP consent (versioned, timestamped), separate WhatsApp opt-in, 18+ or guardian consent; UTM and referral capture; duplicate flagging; confirmation email; applicant portal (status, seat accept/decline, documents); team and roles; data requests; audit log; health page.

**Phase 2: partner CRM and outreach.** Spreadsheet import with column mapping, verification flags and manual tasks; pipeline with stages, temperature, owners, bulk scheduling; 12 editable templates with merge fields; sequences (day 0/5/12, call task day 15); today's queue with required personal line, ✨ AI suggestion, verification gate, daily cap and random spacing; Gmail OAuth sending from each person's mailbox with threading; hourly reply/opt-out/bounce detection; district letter PDF; private partner page (plan, contacts, nodal officer, fellow list after confirmation, share kit with tracked links, question form); timeline of 25 tasks generated from Day 1; morning digest.

**Phase 3: selection and ambassadors.** Rubric editor; balanced two-reviewer assignment; anonymised reviewer view with labelled AI summary; score board with disagreement flags and cohort diversity; bulk decisions with email preview; interview self-scheduling; seat deadlines, reminders, expiry and automatic waitlist offers; ambassador sign-up, approval, referral link and QR, live leaderboard, weekly emails; WhatsApp provider interface (console + Meta Cloud API) behind a flag.

**Phase 4: event and after.** Balanced team formation; run-of-show; QR passes and offline-capable phone check-in; attendance and emergency contacts; daily feedback; certificates (participation, winner, ambassador) with public verification; team submissions; compendium PDF; impact report (PDF/CSV); partner thank-you notes; retention sweep; start next edition; nightly encrypted backups; Resend webhook.

**Tests:** 80+ unit and database tests (including RLS checks acting as different users), 10 Playwright end-to-end tests (applicant, guardian, staff decision, outreach send and reply, reviewer, check-in, ambassador, every staff page, public pages) with axe accessibility checks. CI runs all of them on every pull request.

## Known limitations

- **Not deployed yet:** needs the accounts in "Deploying". Until then everything runs locally against Docker Supabase and Mailpit.
- **Real Gmail** sending and reply reading are implemented against the Gmail REST API but can only be exercised once the Google OAuth client exists; locally a stand-in delivers to Mailpit and replies are simulated.
- **WhatsApp** is wired but untested against a real provider (no provider chosen); it stays off until you pick one and get templates approved.
- **AI** suggestions and summaries need `ANTHROPIC_API_KEY`; without it those buttons explain why and everything else works.
- **Content drafts:** Hindi copy, the privacy notice, the 12 outreach templates, landing-page FAQs and the letterhead details (`src/content/organisation.ts`) need review; posters are placeholder links.
- **Free tiers:** Resend free sends 100 emails/day (excess waits until the next day); Supabase free storage is 1 GB and has no managed backups (nightly GitHub Action instead); Vercel Hobby crons are daily (pg_cron covers the rest) and Hobby is for non-commercial use.
- **Email link scanners** in some inboxes can consume one-time sign-in links; the 6-digit code in the same email always works.
- **Lighthouse/LCP** on a real mid-range phone hasn't been measured yet (needs the deployed site). JS on public pages is ~180 KB gzipped, mostly the React/Next runtime.
- **Uploads in the application form** (file questions) and the compendium with real team PDFs are covered by integration code paths but not by a browser test.
