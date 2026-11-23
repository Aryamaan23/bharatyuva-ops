# Privacy and data protection (DPDP Act 2023)

What the platform holds, why, who can see it, how long it is kept, and how it is deleted.
The public notice applicants read is `src/content/privacy.ts` (shown at `/en/privacy` and `/hi/privacy`).
**Draft for review by the team and, ideally, a lawyer before applications open.**

## Roles

- **Data Fiduciary:** Beyond the Classroom.
- **Processors (under their terms):** Supabase (database, auth, file storage; production in Mumbai, ap-south-1), Vercel (hosting; functions in Mumbai, bom1), Resend (transactional email), Google (staff Gmail for partner correspondence), Cloudflare (Turnstile bot protection), Sentry (errors, configured to collect no request bodies, cookies, query strings or user data), Anthropic (AI drafts and summaries; anonymised application answers only), Meta/WhatsApp provider (only if enabled, only for opted-in applicants).

## What we hold

| Data | Where | Why | Who can see it |
|---|---|---|---|
| Applicant email, name, phone, date of birth, state, college, optional gender, answers | `app.applicants`, `app.applications` | Assess applications, run the fellowship | Owners, admins, staff. **Reviewers never see contact or identity fields**, only answers to questions not marked PII. |
| Consent records (kind, version, timestamp, IP hash, browser) | `app.consent_records` (append-only) | Prove consent under DPDP s.6 | Owners, admins, staff |
| Guardian name, email, relation (under-18 applicants) | `app.guardian_consents` | Verifiable parental consent | Staff |
| Uploaded documents and answer files | Supabase Storage `documents` bucket (private) | Selection and logistics | Staff via short-lived signed links |
| Emergency contacts, check-ins, feedback | `app.emergency_contacts`, `app.checkins`, `app.feedback_responses` | Safety and running the event | Staff |
| Certificates (name, college, type, code) | `app.certificates` | Issue and verify certificates | Public verify page shows name, college, type, edition only |
| Partner organisations and contacts (public office details) | `app.organisations`, `app.contacts` | Outreach | Staff |
| Ambassador name, email, college, phone | `app.ambassadors` | Referral programme | Staff; leaderboard shows first name and college |
| Messages sent (copies) | `app.outbound_messages` | Delivery, retries, audit | Staff; bodies removed after 90 days |
| Audit log | `app.audit_log` (append-only at database level) | Accountability | Admins |
| AI outputs | `app.ai_generations`, `app.ai_summaries` | Audit of AI use | Staff |

Partners see only confirmed fellows' **name and college**, on their private partner page, once the partnership is confirmed.

## How access is enforced

- Tables live in a Postgres schema (`app`) that is **not exposed** through Supabase's public Data API.
- Row Level Security on every table, enforced on our own server queries too (`withUserDb`). Tests fail CI if any table lacks RLS.
- Reviewers get a server-built, anonymised view of each assigned application; they cannot query applicant tables.
- Gmail refresh tokens are AES-256-GCM encrypted and the column is not readable by any user role.
- Every send, status change, export, role change and deletion is written to the audit log.

## Retention

| Data | Kept until |
|---|---|
| Applications that did not end in attendance (drafts, rejected, waitlisted, declined, unanswered offers) | `retention_months` after the edition's last day (default **12**), then deleted by the monthly sweep |
| Fellows who attended | Kept for certificate verification and alumni contact; deleted on request |
| Applicant accounts with no remaining applications | Deleted by the same sweep (including their login) |
| Message bodies in the outbox | 90 days, then the body is removed (metadata kept for audit) |
| Consent records, audit log, deletion proofs | As long as needed to demonstrate compliance |
| Backups | 30 days (encrypted) |

Retention is set per edition in **Editions & form**.

## Rights requests

1. The person submits `/en/data-request` (Turnstile, rate-limited). The response is the same whether or not we hold data, so the form can't be used to discover who applied.
2. They confirm via an emailed link (valid 7 days).
3. Admins see verified requests in **Data requests**:
   - **Access:** *Download export* (JSON, logged), send it to them, *Mark as sent*.
   - **Deletion:** type DELETE and *Erase data*. This deletes the applicant, all their applications (with consents, guardian records, documents, check-ins, feedback, certificates), their files in Storage and their login, cancels queued messages, and scrubs past message copies. Only a keyed hash of the email address is kept as proof.
4. Respond within 30 days. Withdrawing WhatsApp consent is one click in the applicant portal or replying STOP.

## Children

Applicants under 18 must name a parent or guardian, who receives an email to read the notice and consent. The application is flagged *awaiting guardian* until they do. Children are not tracked and no advertising is used anywhere.

## Breach response

If personal data may have been exposed: rotate affected secrets (RUNBOOK §10), review the audit log, notify the Data Protection Board of India and affected people as the DPDP Rules require, and record what happened and what changed.
