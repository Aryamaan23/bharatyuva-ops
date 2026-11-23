# Bharat Yuva Platform: build plan

Status: **approved ("go" on 23 Nov 2026)**. All four phases built and tested locally (24 Nov 2026); deployment pending accounts. See the change log at the end.
Last updated: 23 Nov 2026

---

## 0. Decisions so far

### Your answers

| Topic | Answer | What it means for the design |
|---|---|---|
| Domain | Subdomain of the BtC site, and we control DNS | App at `bharatyuva.<btc-domain>` (working name: `APP_DOMAIN`). Resend sends from that subdomain with its own SPF/DKIM/DMARC records, so the parent domain's mail setup is untouched. **I still need the parent domain name.** |
| Staff mail | Personal Gmail (no Workspace) | See §4.3. The Gmail OAuth app is "External". It runs **published but unverified**, which allows up to 100 users and shows a one-time warning screen. Weekly re-login isn't needed. If Google revokes a token, the app shows a "Reconnect Gmail" banner and stops that person's queue. Moving to Workspace later removes the warning and is a config change, not a rebuild. |
| Vercel | Hobby (free) | Vercel crons run **at most once a day**, and only roughly within the scheduled hour. Sub-daily work (hourly reply checks, the send queue every 5 minutes) is triggered by **Supabase `pg_cron` + `pg_net`** calling our protected routes. That is free and doesn't depend on GitHub Actions minutes. ⚠️ Vercel's Hobby terms are for non-commercial use. A non-profit fellowship is arguably fine, but please check this yourselves. |
| WhatsApp | Decide later | I build the `WhatsAppProvider` interface, a `console` adapter (logs only) and a Meta Cloud API adapter. The feature flag `FEATURE_WHATSAPP` stays off. Switching to AiSensy or Interakt later means adding one adapter file. |
| Templates | I draft all 9 | First email, follow-up 1 and follow-up 2 for each of university, district and embassy. They're seeded as editable rows, not hard-coded. |
| Supabase | Free plan for staging and prod | No managed backups and auto-pause after 7 days of inactivity. Replaced by a **nightly GitHub Actions job**: `pg_dump` → encrypted with `age` → stored as a private artifact for 30 days. The same job keeps the project active. The restore procedure goes in the RUNBOOK and gets tested once. |
| Provisioning | Build locally first | Phase 1 is built and tested against **local Supabase (Docker)** with email caught by Inbucket. At the end of Phase 1 we create GitHub, Vercel and Supabase together, and I deploy the preview. |

### Decisions I made (tell me if you disagree)

1. **Package manager:** npm (Node 25 no longer ships corepack, so pnpm would need a global install). **Node 24 LTS.** Next.js **16.4.6**.
2. **i18n:** typed dictionaries (`src/i18n/dictionaries`), the pattern from Next's own i18n guide, instead of `next-intl`. `hi.ts` must match `en.ts` exactly (TypeScript and a test enforce this). Hindi stays hidden in production until a native speaker reviews it and sets `reviewed: true`.
3. **RLS that actually applies:** Drizzle connects as a privileged role, which would normally skip RLS. Instead, every user-facing query runs inside `withUserDb(session, fn)`. This opens a transaction, sets `request.jwt.claims` and runs `SET LOCAL ROLE authenticated`, so Postgres RLS enforces access as well as our code. A separate `adminDb` is only importable from `src/server/jobs/**` and admin-only actions, and an ESLint rule enforces that.
4. **Rate limiting:** done in Postgres (a token-bucket function plus a table) rather than adding Upstash. One vendor fewer, and fast enough at our volume.
5. **Outbox pattern for every message:** applicant email, partner Gmail, WhatsApp and digests all go into an `outbound_messages` table first. Each row has a unique `idempotency_key` (e.g. `reminder:48h:<application_id>`), so a re-run job can never send twice. A drainer sends due rows and retries with exponential backoff (1 m, 5 m, 30 m, 2 h, 12 h, then marks the row `failed` and shows it on `/admin/health`).
6. **Safe-by-default email:** `MESSAGE_MODE = log | redirect | live`. `live` is only honoured when `VERCEL_ENV === "production"`. In `redirect` mode every Resend and Gmail send goes to `TEST_INBOX`, with the real recipient shown in the subject line. WhatsApp outside production always uses the console adapter.
7. **PDFs:** `@react-pdf/renderer` (pure JavaScript, runs in Vercel functions) for letters, certificates and compendium covers. `pdf-lib` merges team-submitted PDFs into the compendium.
8. **QR check-in:** each fellow gets a signed token (HMAC) shown as a QR code in their portal and email. The staff scanner uses the browser's `BarcodeDetector` with a `@zxing/browser` fallback, plus manual name search. Check-ins queue offline in IndexedDB and sync when the phone reconnects, because venue Wi-Fi is unreliable.
9. **Supabase Auth email** goes through **Resend SMTP**. Supabase's built-in mailer allows only about 2 emails an hour, which would break magic links on application day.
10. **AI** (Anthropic, `ANTHROPIC_MODEL` default `claude-sonnet-5-5`) is used for four things only: suggesting a personal line, summarising an application for reviewers, drafting Hindi copy, and drafting thank-you notes. Every output is labelled "AI draft". It never produces a score or a decision, and every prompt and output is logged in `ai_generations` for audit.

---

## 1. Constraints from the free tiers (please read)

| Service (free tier) | Limit | Impact | What I do |
|---|---|---|---|
| **Resend free** | 3,000 emails/month, **100/day** | At "thousands of applicants", deadline reminders and decision emails will hit this | The outbox respects a configurable daily cap and spills over to the next day. **Recommendation: upgrade to Resend Pro ($20/mo, 50k/month) the week applications open.** |
| Vercel Hobby | Daily crons only; function time ~60 s | Long jobs must be split | Every job processes in batches (e.g. 50 threads per call) and leaves a cursor, then the next trigger continues |
| Supabase free | 500 MB DB, 1 GB Storage, 50 MB/file, pause after 7 idle days | Uploaded documents and photos fill 1 GB fast | Uploads are limited to PDF/JPG under 5 MB; event photos are stored as links (Google Drive album), not files; the nightly backup job keeps the project active |
| Gmail (personal) | About 500 sends/day per account; spam risk at volume | Fine at a 30/day cap | Hard cap, random 3–8 min spacing, plain-text-first emails, poster as a link |
| GitHub Actions (private repo) | 2,000 min/month | CI plus the nightly backup ≈ 600 min/month | Fine |
| Sentry free | 5k errors/month | Fine | |

Expected monthly cost on free tiers: **₹0**, plus Anthropic usage (probably under $5 per edition) and the Resend upgrade when needed.

---

## 2. Architecture

```
Browser (public site · applicant portal · staff app · partner page · ambassador page)
   │
   ▼
Next.js on Vercel (App Router, Server Components, Server Actions, Route Handlers)
   ├─ src/app/(public)/[locale]/…         landing, apply, verify certificate
   ├─ src/app/(portal)/…                  applicant, ambassador, partner (magic link)
   ├─ src/app/(staff)/admin/…             dashboard, CRM, selection, event ops
   ├─ src/app/api/cron/*                  protected by CRON_SECRET (Vercel cron + pg_cron)
   ├─ src/app/api/webhooks/*              Resend events, WhatsApp, (later) Gmail push
   └─ src/server/
        ├─ db/        Drizzle schema, migrations, withUserDb / adminDb
        ├─ auth/      session, requireRole(), partner/applicant token links
        ├─ domain/    pure logic: sequences, assignment, waitlist, team balance, merge fields
        ├─ messaging/ outbox, ResendSender, GmailSender, WhatsAppProvider(+adapters)
        ├─ jobs/      one file per job, all idempotent, all log to job_runs
        ├─ ai/        Anthropic client + 4 prompt modules
        └─ pdf/       letter, certificate, compendium
   │
   ▼
Supabase: Postgres (RLS on every table) · Auth · Storage (private buckets, signed URLs) · pg_cron+pg_net
External: Gmail API (per staff OAuth) · Resend · Anthropic · Turnstile · Sentry · WhatsApp (flagged)
```

**Scheduling**

| Trigger | Schedule (IST) | Route | Work |
|---|---|---|---|
| Vercel cron | 08:30 daily | `/api/cron/morning` | Build outreach queues, task digest, overdue alerts, **monthly retention sweep on the 1st** |
| Vercel cron | 18:00 daily | `/api/cron/evening` | Draft reminders (48 h / 24 h), seat-confirmation reminders, waitlist offers |
| Vercel cron | Mon 09:00 | `/api/cron/weekly` | Ambassador progress, owners' weekly summary |
| pg_cron | Hourly, 07:00–23:00 | `/api/cron/replies` | Gmail reply/bounce/opt-out detection (batched) |
| pg_cron | Every 5 min, 09:00–19:00 | `/api/cron/drain` | Send due outbox rows (spaced Gmail sends, retries) |
| GitHub Actions | 02:00 nightly | n/a | Encrypted `pg_dump` backup |

Vercel Hobby crons are scheduled in UTC and may fire any time within the hour. 08:30 IST is set as `0 3 * * *`, so it actually runs between 08:30 and 09:30 IST. The README will note this.

---

## 3. Data model (Postgres, all tables with RLS)

Shared columns on all tables: `id uuid`, `created_at`, `updated_at`. Each group lists its tables and key fields.

**Identity and access**
- `profiles` (user_id → auth.users, full_name, phone, locale)
- `staff_roles` (user_id, role: `owner|admin|staff|reviewer`)
- `gmail_connections` (user_id, google_email, encrypted refresh_token [AES-256-GCM, `TOKEN_ENCRYPTION_KEY`], scopes, status, daily_cap, last_error)
- `signatures` (user_id, html, text)

**Editions**
- `editions` (slug, name, status `draft|outreach|applications|selection|event|closed`, day1/2/3 dates, venues jsonb, application_open/close_at, seat_confirm_hours, retention_months, poster links per partner type, timeline_template_id)
- `form_definitions` (edition_id, version, schema jsonb: steps → questions {type, label_en, label_hi, required, word_limit, options, pii flag, reviewer_visible})
- `consent_versions` (edition_id, kind `processing|whatsapp|guardian`, version, text_en, text_hi, published_at)

**Applicants and applications**
- `applicants` (one row per person, across editions: email unique, phone normalised E.164, name, dob, state, college, gender (optional, consented), user_id)
- `applications` (edition_id, applicant_id, form_version, answers jsonb, status `draft|submitted|under_review|shortlisted|interview|selected|waitlisted|rejected|withdrawn|confirmed|declined|attended`, submitted_at, utm_source/medium/campaign, referral_code, duplicate_of, resume_token_hash, seat_offer_expires_at, waitlist_rank)
- `consent_records` (applicant_id, consent_version_id, granted bool, at, ip_hash, user_agent)
- `guardian_consents` (application_id, guardian_name, guardian_email, token_hash, confirmed_at)
- `documents` (application_id, kind, storage_path, uploaded_at)
- `deletion_requests` (applicant_email_hash, status, requested_at, processed_by, processed_at)

**Partners and CRM**
- `organisations` (type `university|district|embassy|other`, name, location, website, do_not_contact bool, past_partner bool [derived], source_url, verification_note, needs_verification bool)
- `contacts` (organisation_id, role_title, name, email, phone, channel `email|form|phone`, is_primary, bounced_at)
- `partnerships` (edition_id, organisation_id, stage `not_contacted|email_sent|follow_up_1|follow_up_2|in_discussion|confirmed|declined|do_not_contact`, temperature, owner_id, next_action_at, fit_reason, suggested_approach, personal_line)
- `sequence_steps` (partnership_id, step `first|fu1|fu2|call`, due_at, status `pending|queued|sent|skipped|stopped`, outbound_message_id)
- `email_templates` (partner_type, step, subject, body markdown with merge fields, locale, version)
- `gmail_threads` (partnership_id, sender_user_id, gmail_thread_id, last_our_message_id, last_checked_at, reply_detected_at)
- `activities` (partnership_id, kind `note|email_sent|reply|call|stage_change|task|letter`, body, actor_id, at)
- `tasks` (edition_id, title, owner_id, due_at, status, partnership_id?, checklist jsonb, offset_days, template_task_id)
- `partner_access` (partnership_id, contact_email, token_hash, last_seen_at)
- `partner_requests` (partnership_id, message, status)
- `imports` (file_name, sheet, mapping jsonb, rows_total, rows_created, rows_updated, rows_skipped, report jsonb, actor)

**Ambassadors**
- `ambassadors` (edition_id, applicant_id or user_id, college, code unique, status `pending|approved|rejected`)
- Referrals are counted from `applications.referral_code`; a materialised leaderboard view is refreshed on submit

**Selection**
- `rubrics` (edition_id, criteria jsonb [{key, label, weight, max, guidance}])
- `review_assignments` (application_id, reviewer_id, due_at, status), unique (application, reviewer), 2 per application
- `reviews` (assignment_id, scores jsonb, comment, submitted_at)
- `ai_summaries` (application_id, model, summary, created_at)
- `interview_slots` (edition_id, starts_at, ends_at, capacity, meeting_link, interviewer_id)
- `interview_bookings` (slot_id, application_id)
- `decision_batches` (edition_id, action, template_id, application_ids, previewed_by, sent_by, sent_at)

**Event**
- `teams` (edition_id, name, mentor), `team_members` (team_id, application_id)
- `run_of_show` (edition_id, day, starts_at, title, owner, location, notes)
- `checkins` (application_id, day, at, by_user, client_id [dedupe for offline sync])
- `emergency_contacts` (application_id, name, relation, phone)
- `feedback_forms` / `feedback_responses` (day, answers jsonb, rating)

**After the event**
- `certificates` (application_id, kind `participation|winner|ambassador`, code unique, pdf_path, issued_at, revoked_at)
- `submissions` (team_id, title, file_path, abstract, submitted_at, status)
- `compendiums` (edition_id, order jsonb, pdf_path, generated_at)

**Platform**
- `outbound_messages` (channel `resend|gmail|whatsapp`, idempotency_key unique, to, subject, body, template_ref, sender_user_id, not_before, status `pending|sending|sent|failed|cancelled|redirected`, attempts, last_error, provider_id, sent_at)
- `message_events` (outbound_message_id, kind `delivered|bounced|complained|opened?`, raw)
- `job_runs` (job, started_at, finished_at, status, items_processed, error, trigger `vercel|pg_cron|manual`)
- `audit_log` (actor_id, action, entity, entity_id, before/after jsonb, at, ip_hash). Insert-only, with no update or delete for any role.
- `ai_generations` (purpose, entity_id, model, prompt_hash, output, approved_by, at)
- `rate_limits` (key, tokens, refilled_at)

**Carry-over between editions:** organisations, contacts, templates, rubric templates, timeline templates and applicants (as alumni) are not edition-specific. "Start next edition" copies the edition's settings, form, rubric and task plan (offsets kept, dates recomputed from the new Day 1), and creates a fresh `partnerships` row in `not_contacted` for every organisation not marked do-not-contact. It sets `past_partner` where an earlier partnership was `confirmed`.

---

## 4. Key flows in detail

### 4.1 Applications
Landing → Apply (Turnstile) → email entry → **magic resume link** emailed → multi-step form with autosave (debounced server action, so the draft lives on the server and a phone dying loses nothing) → consent step (processing consent required; WhatsApp opt-in separate and unticked; 18+ confirmation, or a guardian name and email that triggers a guardian confirmation link, with the application held until the guardian confirms) → submit → confirmation email (and WhatsApp if opted in and the flag is on).

Duplicate detection: email exact match, plus normalised phone match. A second submission is linked to the first one and flagged for admin review, not silently merged.

The form pages ship minimal client JavaScript. *(Revised in Phase 1: the React 19 + Next 16 runtime alone is about 145 KB gzipped on every App Router page, so the old "under 100 KB" target can't be met. Measured: landing page 177 KB in total, of which our code is about 30 KB. The landing HTML is static, so text renders before JS loads. LCP is the target; measured with Lighthouse in Phase 4.)*

### 4.2 Excel import
Upload → we detect the sheets (Universities/Districts/Embassies → partner type) and the header row (row 3 in the attached file) → a mapping screen with columns pre-matched by name → dry-run report (new, updated, skipped, warnings) → commit. Notes on the source file:
- *Named contact* and *Email* can hold several values separated by `;`. Each becomes a separate `contacts` row.
- If *Verification* contains "confirm", "re-confirm" or "check", or *Named contact* says "confirm current names", then `needs_verification = true`. The send button shows a **"Check before sending"** warning that someone must tick to clear.
- If the only channel is a contact form or phone, the import creates a **manual task** with a checklist (open form, paste letter, attach poster link, log submission).
- The import is idempotent: re-importing the same file updates matching rows (matched on type + organisation name) and never duplicates them.

### 4.3 Outreach sending (Gmail)
1. The **morning job** creates due `sequence_steps` for each owner: first emails for partnerships the owner has scheduled, FU1 at day 5, FU2 at day 12, and a "call the office" task at day 15.
2. Staff open **Today's queue**. Each card shows the merged email, the "check before sending" flag if set, and a required **personal line** field with an **"Suggest a line"** button (AI, using fit reason, notes and past-partner status). A card can't be approved while the personal line is empty.
3. **Approve & send** puts approved emails in the outbox, spaced 3–8 minutes apart at random. The drainer sends each one through that staff member's Gmail as `From: <their name>`, in reply to the existing thread for follow-ups. Approvals beyond the daily cap of 30 roll over to tomorrow automatically.
4. Plain-text and simple HTML. The poster is a link (a tracked short link `/p/<code>` that logs clicks). The first email ends with: *"If this isn't relevant, just reply 'no' and we won't write again."*
5. The **hourly reply check** reads each open thread: a reply from anyone other than us → sequence stopped, stage → `in_discussion`, owner notified (email plus a dashboard badge). If the reply's first line is "no", "not interested" or "unsubscribe" → do-not-contact (reversible by an admin, and logged). A mailer-daemon bounce → contact marked bounced and a task created to find a new address.

**Gmail OAuth scopes and why we need them**
- `https://www.googleapis.com/auth/gmail.send` *(sensitive)*: to send outreach as the staff member.
- `https://www.googleapis.com/auth/gmail.readonly` *(restricted)*: to read **only the threads we started** and detect replies, bounces and "no". (Gmail has no narrower scope that can read a specific thread's replies; `gmail.metadata` cannot read the reply body we need for opt-out detection.)
- `openid email profile`: to match the Google account to the staff user.

Because `gmail.readonly` is restricted, a public launch would need Google's paid security assessment (CASA). We avoid that by staying **unverified, under 100 users**, which is allowed. Only the 2–3 staff ever connect. Tokens are encrypted at rest and never sent to the browser.

### 4.4 District letters
A "Generate letter" button on any district partnership produces a PDF on the BtC letterhead with the merge fields and the signatory's name. It can be downloaded, or attached to the Gmail send (a letter is the one exception to "no attachments", because district offices expect it). **I need the letterhead (logo, address line) from you.**

### 4.5 Selection
Rubric builder → auto-assignment (each submitted application goes to 2 reviewers. A greedy algorithm assigns to whoever has the fewest open reviews, never the same pair twice in a row, and skips reviewers who share a college with the applicant if the reviewer has set their college). The **reviewer screen** comes from a database view that leaves out every question marked `pii` and all contact fields. The AI summary sits above the answers in a box labelled "AI summary: may be wrong; score from the answers". Admin screens: score table with disagreement flag (score gap > 30%), diversity panel, bulk actions → **preview screen** (rendered email for 3 sample recipients plus the count) → send. Selected applicants get `seat_offer_expires_at`. The evening job sends reminders 24 h before expiry, expires unanswered offers, and offers the next waitlisted applicant by rank.

### 4.6 Event day
The staff phone scanner shows a big green or red result, the fellow's name, team and emergency contact. Each day has its own check-in. Feedback links go out at 18:00 on the day. Teams are formed by a balancing algorithm (round-robin on discipline, then state, then gender) with manual drag-and-drop adjustment.

---

## 5. Screens

**Public** (EN/HI): `/` edition landing · `/apply` · `/apply/resume` · `/privacy` · `/data-request` (deletion/access) · `/verify/[code]` certificate check · `/r/[code]` ambassador referral redirect · `/p/[code]` tracked poster link · `/ambassadors/join`

**Applicant portal:** `/me` status timeline · accept/decline seat · upload documents · book interview slot · QR pass · download certificate · team and submission upload

**Partner page:** `/partner/[token]` day plan, dates, our contacts, nodal officer (district), fellow list (name + college only, after confirmation), share kit (poster, captions, WhatsApp text with tracked link), questions/changes form

**Ambassador:** `/ambassador` link + QR + stats + leaderboard position

**Staff (`/admin`):**
- Dashboard (days to Day 1, Day 1/2/3 status cards, today's queue count, overdue tasks, funnel + sources chart, leaderboard, last cron runs)
- Editions: list · settings · form builder · consent texts · "start next edition"
- CRM: pipeline board (columns by stage, filter by type/temperature/owner) · partnership detail (timeline, contacts, sequence, letter, partner access link) · **Today's queue** · templates · import wizard · Gmail connection
- Applications: table with filters · application detail · duplicates · deletion requests
- Selection: rubric · reviewer workload · my reviews (reviewer role) · scores and decisions · interview slots · waitlist
- Ambassadors: approvals · leaderboard
- Event: teams · run-of-show · check-in scanner · attendance · feedback results
- After: certificates · submissions inbox · compendium builder · impact report (PDF/CSV)
- Tasks: timeline (Gantt-lite list grouped by week) · my tasks
- Settings: users and roles · signatures · audit log · exports (logged) · `/admin/health`

---

## 6. Security and privacy checklist (built in from Phase 1)

- RLS on every table, with a test that fails CI if any table lacks it. Server actions call `requireRole()` and validate input with Zod.
- CSRF: Server Actions check the origin by default; route handlers that change data check the `Origin` header. Webhooks check provider signatures. Crons compare `CRON_SECRET` in constant time.
- Rate limits: apply start (5 per IP per hour), magic link (3 per email per 15 min), partner/ambassador forms.
- Turnstile on the apply form and data-request form.
- Audit log for every send, status change, export, role change and deletion.
- DPDP: minimum fields; consent versioned and timestamped; withdrawing WhatsApp consent is one click in the portal; deletion workflow (request → identity check by email link → admin approve → hard delete of applicant data plus storage files, with a hashed record kept to prove it was done); monthly retention sweep deletes unsuccessful applications after `retention_months` following the event; exports are admin-only and logged.
- Secrets only in environment variables; `.env.example` documents each one; refresh tokens encrypted.

---

## 7. Testing and CI

- **Vitest:** merge fields, sequence scheduling, cap and spacing, reply classification, assignment balance, waitlist promotion, team balancing, import parsing (run against a **fake** copy of the spreadsheet with the same structure; the real file is never committed), RLS policy tests run against local Postgres using real JWT claims.
- **Playwright:** apply → resume → submit → confirmation in Inbucket; staff login → import → queue → send (Gmail mocked) → reply detected; reviewer can't see contact fields; scan check-in; certificate verify.
- **GitHub Actions on every PR:** install → lint → typecheck → `supabase start` → migrations → Vitest → Playwright → build. Migrations run against staging on merge to `main`, and against production manually with a protected-environment approval.
- **Seed script:** realistic **fake** applicants, partners and reviewers (Faker with an Indian locale). It never touches real contacts. The real partner file is only loaded through the import screen.
- **The real spreadsheet stays out of git.** I'll add `*.xlsx` to `.gitignore`. It's currently untracked in the repo folder. Please confirm whether you want it committed at all (I recommend not: it holds names and phone numbers).

---

## 8. Phase plan

Each phase ends with: deployed preview, a checklist of what you can click, test results, and what I need from you.

### Phase 1: Foundation and applications
Scaffold (Next.js, TS strict, Tailwind, shadcn/ui, brand tokens, Source Sans 3) · ESLint/Prettier · CI · local Supabase · Drizzle schema for identity, editions, applications, consent, platform tables · RLS + tests · auth (Google + magic link for staff, magic link for applicants) · roles · edition settings · form builder (basic) · landing page EN/HI · application flow with drafts, consent, guardian flow, Turnstile, UTM/referral capture, duplicates · applicant portal (status, accept/decline, uploads) · outbox + Resend sender + `MESSAGE_MODE` · confirmation email · Sentry · `/admin/health` (basic) · **then provisioning together: GitHub repo, Vercel project, 2 Supabase projects, preview deploy.**

### Phase 2: Partner CRM and outreach
Excel import wizard · organisations/contacts/partnerships · pipeline board · templates (9 drafted) · sequences · Today's queue with personal line + AI suggest · Gmail OAuth + sender + cap + spacing · pg_cron scheduling · reply/bounce/opt-out detection · district letter PDF · manual tasks for form/phone contacts · partner page · timeline with 25 seeded tasks · morning digest · draft reminders · dashboard v1.

### Phase 3: Selection and ambassadors
Rubric · assignment · reviewer screen (PII-free view) · AI summaries · score table + diversity · bulk decisions with preview · interview slots · seat deadlines + waitlist automation · ambassadors (sign-up, approval, link, QR, leaderboard, weekly email) · WhatsApp interface + Meta adapter behind flag.

### Phase 4: Event and after; production
Teams · run-of-show · offline-capable QR check-in · attendance · emergency contacts · feedback · partner thank-yous · certificates + verify page · submissions inbox · compendium builder · impact report PDF/CSV · retention sweep · nightly backup workflow + tested restore · health page complete · accessibility pass (axe in Playwright + manual keyboard/200% zoom) · Lighthouse mobile check · production deploy, domain, DNS, `README.md`, `docs/RUNBOOK.md`, `docs/PRIVACY.md`, known limitations.

---

## 9. What I need from you (not blocking Phase 1 until noted)

| Item | Needed by |
|---|---|
| BtC parent domain name (e.g. `beyondtheclassroom.org`) and the subdomain you want | End of Phase 1 (deploy) |
| Docker Desktop running on this Mac (for local Supabase) | **Start of Phase 1** |
| Official BtC email on the new subdomain for the signature (or I'll use `team@<APP_DOMAIN>`) | Phase 1 |
| The three poster PDFs | Phase 2 (Phase 1 uses placeholders) |
| Letterhead: logo (SVG/PNG), address line, registration number if any | Phase 2 |
| 1.0 proof points for the landing page (photos you have rights to, quotes, NITI Aayog mention wording) | Phase 1 (placeholder copy until then) |
| Accounts: GitHub, Vercel, Supabase ×2, Resend, Google Cloud project, Anthropic API key, Cloudflare Turnstile, Sentry | End of Phase 1 |
| A Hindi reviewer | Before applications open |
| Decision on Resend Pro | Before applications open |
| WhatsApp provider | Phase 3 (optional) |

---

## 10. Known risks

1. **Personal Gmail for cold outreach:** Google may rate-limit or flag a new personal account sending to `nic.in` addresses. The 30/day cap and spacing reduce the risk. A Workspace mailbox on your domain would be more credible to officials, and I'd recommend it for 3.0.
2. **The unverified-app warning:** each staff member sees a "Google hasn't verified this app" screen once when connecting. Expected and harmless at 2–3 users.
3. **Hobby cron timing:** daily jobs can drift by up to an hour. Nothing time-critical depends on the exact minute.
4. **Free Supabase:** a backup restore is manual (about 15 minutes, written up in the runbook). If the project is ever paused despite the keep-alive, restoring it takes one click in the dashboard.
5. **District officer data changes on transfer:** the import flags these contacts, and the "check before sending" gate stops anything going out before someone checks.

---

## Change log

**23 Nov 2026: Phase 1 build decisions**
- Next.js 16 enables `cacheComponents` in new projects. I turned it off: almost every staff and portal page reads the session. Public pages are static/ISR explicitly.
- `middleware.ts` is called `proxy.ts` in Next 16.
- Tables live in a Postgres schema `app` that Supabase's Data API does not expose; RLS helper functions live in `app_private`. This removes the "anyone with the anon key can call PostgREST" attack surface entirely.
- The production database should be in Supabase **Mumbai (ap-south-1)**, with Vercel functions in `bom1`, to keep latency low and data in India.
- Supabase's local Mailpit SMTP port is exposed (54325) so local email is captured, not sent.
- Turnstile verification is skipped when no secret is configured, except on a Vercel production deployment, which fails closed.
- Sentry v11 collects request bodies, cookies and headers by default. These are disabled (`dataCollection`) so applicant data never reaches Sentry.

**24 Nov 2026: Phases 2–4 built (user asked to build everything without phase stops)**
- Gmail: OAuth per staff member, encrypted refresh tokens (column not readable by any user role), REST send with threading, hourly thread reads; a local stand-in delivers to Mailpit when Google isn't configured.
- Outreach emails are queued with random 3–8 minute spacing and a per-person daily cap; pg_cron drains the queue every 5 minutes.
- Reviewers never query applicant tables; they get a server-built anonymised view of their own assignments only.
- The evening job refills seats for every edition with a waitlist; declining a seat offers it immediately.
- Certificates and compendium PDFs are rendered on demand (no Storage used), so the free 1 GB isn't consumed.
- Per-IP magic-link limit raised to 60/hour: whole campuses can share one IP; Turnstile still blocks bots.
- AI uses `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`, as briefed) with server-side refusal fallback enabled.
