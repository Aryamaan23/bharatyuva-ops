# Bharat Yuva Platform: runbook

How a two- or three-person team runs an edition with the platform. Staff app: `/admin`.
Every action below is logged in **Audit log**; every scheduled job shows on **Health**.

---

## 1. Start a new edition

1. **Event & after → Start the next edition** (from the previous edition), or **Editions & form → New edition**.
   Starting from the previous edition copies settings, the application form, the rubric and the timeline, and puts every partner back in the pipeline (do-not-contact excluded; past partners flagged *Hot*).
2. **Editions & form → (edition)**: set the three dates, venues, application open/close (IST), seats, seat-confirmation hours, poster links, documents requested after selection. Save.
3. **Make current** on the Editions list. The public site and apply form now use this edition.
4. **Application form**: edit questions (English and Hindi), then **Save and publish**. Applicants who already started keep their version.
5. **Tasks → Generate the timeline** (needs the Day 1 date). Assign owners.
6. **Selection → Rubric**: check the criteria.

## 2. Partner outreach, every day

**Once:** each staff member opens **Gmail** in the menu and clicks **Connect my Gmail** (Google shows an "unverified app" screen once: Advanced → Continue).

**First time each edition:** **Partners → Import spreadsheet** with the outreach workbook. Rows whose verification note says "re-confirm" get a **Check before sending** flag; contact-form and phone-only entries become tasks.

**Each morning (≈20 min):**
1. Read the 08:30 digest email (queue, replies, overdue tasks).
2. **Today's queue**: for each card, write or accept the one-line personal reason (✨ Suggest drafts one), tick "I've checked" where flagged, read the email, **Approve & send**. Emails go from *your* Gmail 3–8 minutes apart, at most 30 a day (admins can change the cap).
3. Reply to partners who answered, from your own inbox. The app has already stopped their follow-ups and moved them to *In discussion*.
4. Work through **Tasks → Mine** (call-the-office tasks appear on day 15; contact forms; bounces).

**To add partners to the sequence:** **Partners**, filter, tick, choose the owner and date, **Schedule first email**. Follow-ups are automatic on day 5 and day 12 unless they reply.

**When a partner confirms:** set the stage to *Confirmed* on their page, add the day plan (and nodal officer for districts), then **Create link** under *Private partner page* and send it to them. The Day 1/2/3 cards on the dashboard turn green.

**District letters:** partner page → **Download formal letter (PDF)**. It is also attached automatically to the first email and follow-up 1 for districts.

## 3. Applications

- Applications open automatically at the time set on the edition. Share `https://<domain>/en` (and tracked links with `?utm_source=…`).
- Drafts get reminders 48 h and 24 h before the deadline (evening job).
- **Applications**: search, filter, look at possible duplicates (*Not a duplicate* clears the flag), export CSV (admins; logged).
- **Data requests** (DPDP): verified requests appear here. *Erase data* (type DELETE) or *Download export* and *Mark as sent*. Respond within 30 days.

## 4. Selection

1. **Team**: add reviewers with the *Reviewer* role (they only ever see anonymised answers).
2. **Selection → Assign reviewers (2 each)**. Re-run any time; it only tops up.
3. **Generate AI summaries** (optional; needs `ANTHROPIC_API_KEY`). Run again until none remain. Summaries are labelled and never score.
4. Reviewers work through **My reviews**.
5. On **Selection**: sort by mean score, check *reviewers disagree* flags, look at the cohort mix (state, discipline, gender).
6. Tick applicants → choose **Shortlist / Invite to interview / Select / Waitlist / Not selected** → check the preview → tick the confirmation → **Send**.
7. **Interview slots**: add blocks of slots with a meeting link; invited applicants book in their portal.
8. Seat offers expire after the configured hours. The evening job reminds at 24 h, expires unanswered offers, and offers seats to the waitlist in rank order. A decline frees the seat immediately.

## 5. Campus ambassadors

- Share `/en/ambassadors/join`. Approve on **Ambassadors**; each gets a personal link (`/r/AMB-…`) and QR code by email.
- The leaderboard updates live; progress emails go out every Monday.

## 6. Event day

- Before: **Event & after → Teams → Form teams** (balanced), adjust, set mentors. Fill **Run-of-show**. Share fellow lists via partner pages (shown automatically once a partnership is Confirmed).
- Fellows see their QR pass, team and emergency-contact form in their portal.
- **Check-in** on a phone: choose the day, **Scan passes**. No pass? Search by name. If the network drops, scans are saved on the phone and sync when it's back (*Sync N offline scans*).
- **Attendance** shows who came each day and emergency contacts.
- Feedback links go to everyone who checked in at 18:00 each event day; see **Feedback**.

## 7. After the event

1. Mark the winning team on **Teams**.
2. Add the photo album link on each confirmed partner's page, then **Event & after → Queue thank-you notes**.
3. **Certificates → Issue certificates**, then **Email download links**. Anyone can verify a code at `/verify/<code>`.
4. Teams upload their practicum PDF from their portal; see **Submissions**.
5. **Compendium → Generate PDF**.
6. **Impact report**: PDF for sharing, CSV for analysis.
7. **Tasks → Save as next year's template** and hold the debrief.

## 8. Scheduled jobs

| Job | When (IST) | Trigger |
|---|---|---|
| `morning`: due follow-ups → call tasks, digests, monthly retention sweep (1st) | 08:30 | Vercel Cron |
| `evening`: draft reminders, seat reminders/expiry/waitlist, feedback emails | 18:00 | Vercel Cron |
| `weekly`: ambassador progress, owners' summary | Mon 09:00 | Vercel Cron |
| `drain-outbox`: send queued email/Gmail/WhatsApp | every 5 min 09:00–19:00 (+ daily) | pg_cron (+ Vercel) |
| `replies`: Gmail reply/opt-out/bounce detection | hourly 07:00–23:00 | pg_cron |

Run one by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/<job>?trigger=manual`.
If **Health** shows a job hasn't run, check Vercel → Cron Jobs, and in Supabase `select * from cron.job_run_details order by start_time desc limit 20;`.

**Set up pg_cron once per Supabase project:** run `supabase/snippets/schedule-cron.sql` in the SQL editor after replacing the app URL and `CRON_SECRET`.

## 9. Backups and restore

Supabase's free plan has no managed backups. `.github/workflows/backup.yml` runs nightly (02:00 IST): `pg_dump` of the `app`, `app_private`, `auth` and `storage` schemas → encrypted with **age** → kept 30 days as a private workflow artifact.

**One-time setup**
1. On an owner's laptop: `age-keygen -o bharatyuva-backup.key` (store this file in a password manager; it is the only way to decrypt). It prints a public key `age1…`.
2. GitHub repo → Settings → Variables: `BACKUP_AGE_RECIPIENT` = the `age1…` public key.
3. GitHub → Environments → `production` → secret `BACKUP_DATABASE_URL` = the production *session* connection string.
4. Run the workflow once by hand (Actions → Nightly database backup → Run workflow) and check an artifact appears.

**Restore** (practise this once on the staging project):
1. Download the artifact (Actions → run → Artifacts) and unzip it.
2. `age -d -i bharatyuva-backup.key bharatyuva-<stamp>.dump.age > restore.dump`
3. Restore into a fresh or staging Supabase project:
   `pg_restore --no-owner --no-privileges --clean --if-exists -d "<target session connection string>" restore.dump`
4. Run `npx drizzle-kit migrate` against the target to make sure migrations are current, then point the app's `DATABASE_URL` at it.
5. Files in Storage (uploaded documents and submissions) are not in the database dump; download the `documents` bucket periodically from the Supabase dashboard if you need them preserved.

## 10. Rotate secrets

| Secret | How | Effect |
|---|---|---|
| `CRON_SECRET` | New value in Vercel (all envs) **and** re-run the two `vault.create_secret`/update lines for pg_cron | Old cron calls start failing until both are updated |
| `TOKEN_SIGNING_SECRET` | New value in Vercel | Existing QR passes and partner-page signatures stop working: re-share links before event day, not during |
| `HASH_SALT` | Don't rotate unless compromised | Old IP/email hashes can no longer be matched |
| `GMAIL_TOKEN_KEY` | New value, then every staff member reconnects Gmail | Stored refresh tokens become unreadable |
| `SUPABASE_SERVICE_ROLE_KEY`, Resend, Anthropic, Turnstile, Google | Rotate in the provider, update Vercel, redeploy | — |
| Supabase DB password | Supabase → Database → Reset password; update `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `BACKUP_DATABASE_URL` | — |

## 11. When something goes wrong

- **Emails not arriving:** Health → *Failed messages* and *Waiting to send*. In preview, everything goes to `TEST_INBOX` by design. On Resend's free plan, over 100/day defers to tomorrow.
- **Gmail says "needs reconnecting":** the staff member reconnects under **Gmail**; held messages resume within 6 hours (or run `drain-outbox`).
- **A partner replied but the sequence didn't stop:** replies are checked hourly; set the stage to *In discussion* manually to stop it immediately.
- **An applicant can't sign in:** links expire after an hour and work once; they can use the 6-digit code from the same email instead.
