import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/config";
import { env } from "@/lib/env";
import type { SessionUser } from "@/server/auth/session";
import { supabaseService } from "@/server/auth/supabase";
import { adminDb } from "@/server/db/admin";
import {

  applicants,
  applications,
  certificates,
  checkins,
  editions,
  emergencyContacts,
  feedbackResponses,
  outboundMessages,
  partnerships,
  submissions,
  teamMembers,
  teams,
} from "@/server/db/schema";
import { formatDate, formatDayRange } from "@/server/domain/editions";
import { certificateCode, signPass, verifyPass } from "@/server/domain/passes";
import { todayIst } from "@/server/domain/sequences";
import { enqueueEmail } from "@/server/messaging/outbox";
import { renderCertificatePdf } from "@/server/pdf/certificate";
import { renderCompendium, type CompendiumEntry } from "@/server/pdf/compendium";
import { audit } from "./audit";
import { leaderboard } from "./ambassadors";
import { outreachContext, renderOutreach } from "./outreach";

const appUrl = () => env().NEXT_PUBLIC_APP_URL;
const asLocale = (l: string): Locale => (isLocale(l) ? l : "en");
const FELLOW_STATUSES = ["confirmed", "attended"] as const;

export function passTokenFor(applicationId: string) {
  return signPass(applicationId, env().TOKEN_SIGNING_SECRET);
}

async function ownedFellow(user: SessionUser, applicationId: string) {
  const [row] = await adminDb()
    .select({ app: applications, applicant: applicants, edition: editions })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .innerJoin(editions, eq(editions.id, applications.editionId))
    .where(and(eq(applications.id, applicationId), eq(applicants.userId, user.id)))
    .limit(1);
  return row && (FELLOW_STATUSES as readonly string[]).includes(row.app.status) ? row : null;
}

/** Everything a confirmed fellow sees in their portal for the event. */
export async function fellowEventInfo(user: SessionUser, applicationId: string) {
  const own = await ownedFellow(user, applicationId);
  if (!own) return null;
  const db = adminDb();
  const [team] = await db
    .select({ team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.applicationId, applicationId))
    .limit(1);
  const teammates = team
    ? await db
        .select({ name: applicants.fullName, college: applicants.college })
        .from(teamMembers)
        .innerJoin(applications, eq(applications.id, teamMembers.applicationId))
        .innerJoin(applicants, eq(applicants.id, applications.applicantId))
        .where(eq(teamMembers.teamId, team.team.id))
    : [];
  const [emergency] = await db.select().from(emergencyContacts).where(eq(emergencyContacts.applicationId, applicationId)).limit(1);
  const days = await db.select({ day: checkins.day }).from(checkins).where(eq(checkins.applicationId, applicationId));
  const myFeedback = await db.select({ day: feedbackResponses.day }).from(feedbackResponses).where(eq(feedbackResponses.applicationId, applicationId));
  const subs = team ? await db.select().from(submissions).where(eq(submissions.teamId, team.team.id)).orderBy(desc(submissions.createdAt)) : [];
  const certs = await db.select().from(certificates).where(and(eq(certificates.applicationId, applicationId), sql`${certificates.revokedAt} is null`));
  return {
    edition: own.edition,
    pass: passTokenFor(applicationId),
    team: team?.team ?? null,
    teammates,
    emergency: emergency ?? null,
    checkedInDays: days.map((d) => d.day),
    feedbackDays: myFeedback.map((d) => d.day),
    submissions: subs,
    certificates: certs,
  };
}

export async function saveEmergencyContact(user: SessionUser, applicationId: string, data: { name: string; relation: string; phone: string; medicalNotes: string | null }) {
  const own = await ownedFellow(user, applicationId);
  if (!own) return false;
  await adminDb()
    .insert(emergencyContacts)
    .values({ applicationId, ...data })
    .onConflictDoUpdate({ target: emergencyContacts.applicationId, set: data });
  await audit({ actorEmail: user.email, action: "emergency_contact.saved", entity: "application", entityId: applicationId });
  return true;
}

export type CheckinResult =
  | { ok: true; already: boolean; name: string; college: string | null; team: string | null; emergency: string | null; photoHint: string | null }
  | { ok: false; error: "invalid_pass" | "not_a_fellow" | "wrong_edition" };

/** Record a day's check-in from a scanned pass (or a manual pick). Safe to repeat. */
export async function checkIn(input: { token?: string; applicationId?: string; day: number; staffEmail: string; editionId: string; clientId?: string }): Promise<CheckinResult> {
  const id = input.token ? verifyPass(input.token, env().TOKEN_SIGNING_SECRET) : (input.applicationId ?? null);
  if (!id) return { ok: false, error: "invalid_pass" };
  const db = adminDb();
  const [row] = await db
    .select({ app: applications, applicant: applicants })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .where(eq(applications.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "invalid_pass" };
  if (row.app.editionId !== input.editionId) return { ok: false, error: "wrong_edition" };
  if (!(FELLOW_STATUSES as readonly string[]).includes(row.app.status)) return { ok: false, error: "not_a_fellow" };
  const inserted = await db
    .insert(checkins)
    .values({ applicationId: id, day: input.day, byEmail: input.staffEmail, clientId: input.clientId })
    .onConflictDoNothing()
    .returning({ id: checkins.id });
  if (row.app.status !== "attended") await db.update(applications).set({ status: "attended" }).where(eq(applications.id, id));
  const [team] = await db.select({ name: teams.name }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)).where(eq(teamMembers.applicationId, id)).limit(1);
  const [ec] = await db.select().from(emergencyContacts).where(eq(emergencyContacts.applicationId, id)).limit(1);
  if (inserted.length) await audit({ actorEmail: input.staffEmail, action: "checkin.recorded", entity: "application", entityId: id, after: { day: input.day } });
  return {
    ok: true,
    already: inserted.length === 0,
    name: row.applicant.fullName ?? row.applicant.email,
    college: row.applicant.college,
    team: team?.name ?? null,
    emergency: ec ? `${ec.name} (${ec.relation}) ${ec.phone}` : null,
    photoHint: ec?.medicalNotes ?? null,
  };
}

export async function submitFeedback(user: SessionUser, day: number, input: { rating: number; liked: string; improve: string }) {
  const db = adminDb();
  const [row] = await db
    .select({ app: applications })
    .from(applications)
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .innerJoin(editions, eq(editions.id, applications.editionId))
    .where(and(eq(applicants.userId, user.id), eq(editions.isCurrent, true)))
    .limit(1);
  if (!row) return false;
  const [checked] = await db.select().from(checkins).where(and(eq(checkins.applicationId, row.app.id), eq(checkins.day, day))).limit(1);
  if (!checked) return false;
  const answers = { liked: input.liked.slice(0, 2000), improve: input.improve.slice(0, 2000) };
  await db
    .insert(feedbackResponses)
    .values({ applicationId: row.app.id, day, rating: input.rating, answers })
    .onConflictDoUpdate({ target: [feedbackResponses.applicationId, feedbackResponses.day], set: { rating: input.rating, answers } });
  return true;
}

/** On each event day, email a feedback link to fellows who checked in that day. Idempotent. */
export async function queueFeedbackEmails(now = new Date()) {
  const db = adminDb();
  const today = todayIst(now);
  const evs = await db.select().from(editions).where(sql`${today} in (${editions.day1Date}, ${editions.day2Date}, ${editions.day3Date})`);
  let queued = 0;
  for (const e of evs) {
    const day = e.day1Date === today ? 1 : e.day2Date === today ? 2 : 3;
    const rows = await db
      .select({ app: applications, applicant: applicants })
      .from(checkins)
      .innerJoin(applications, eq(applications.id, checkins.applicationId))
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .where(and(eq(applications.editionId, e.id), eq(checkins.day, day)));
    for (const { app, applicant } of rows) {
      const locale = asLocale(app.locale);
      const url = `${appUrl()}/${locale}/feedback/${day}`;
      const id = await enqueueEmail({
        idempotencyKey: `feedback:${day}:${app.id}`,
        to: applicant.email,
        template: "feedback_request",
        email: {
          subject: locale === "hi" ? `${e.name}: दिन ${day} कैसा रहा?` : `${e.name}: how was Day ${day}?`,
          html: null,
          text:
            locale === "hi"
              ? `नमस्ते ${applicant.fullName ?? ""},\n\nआज के दिन के बारे में 1 मिनट में बताइए: ${url}\n\nटीम भारत युवा`
              : `Hi ${applicant.fullName ?? ""},\n\nTell us about today in one minute: ${url}\n\nThank you,\nTeam Bharat Yuva`,
        },
        relatedEntity: "application",
        relatedId: app.id,
      });
      if (id) queued += 1;
    }
  }
  return queued;
}

// ---------------------------------------------------------------- Certificates

/** Issue participation (anyone who checked in), winner and top-ambassador certificates. Idempotent. */
export async function issueCertificates(editionId: string, actorEmail: string, topAmbassadors = 3) {
  const db = adminDb();
  const [edition] = await db.select().from(editions).where(eq(editions.id, editionId)).limit(1);
  if (!edition) return { participation: 0, winner: 0, ambassador: 0 };
  const year = Number((edition.day1Date ?? new Date().toISOString()).slice(0, 4));
  const counts = { participation: 0, winner: 0, ambassador: 0 };

  const attended = await db
    .selectDistinct({ id: applications.id, name: applicants.fullName, email: applicants.email, college: applicants.college })
    .from(checkins)
    .innerJoin(applications, eq(applications.id, checkins.applicationId))
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .where(eq(applications.editionId, editionId));
  for (const a of attended) {
    const r = await db
      .insert(certificates)
      .values({ editionId, applicationId: a.id, kind: "participation", code: certificateCode(year), recipientName: a.name ?? a.email, college: a.college })
      .onConflictDoNothing()
      .returning({ id: certificates.id });
    counts.participation += r.length;
  }
  const winners = await db
    .select({ id: applications.id, name: applicants.fullName, email: applicants.email, college: applicants.college, team: teams.name })
    .from(teams)
    .innerJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .innerJoin(applications, eq(applications.id, teamMembers.applicationId))
    .innerJoin(applicants, eq(applicants.id, applications.applicantId))
    .where(and(eq(teams.editionId, editionId), eq(teams.isWinner, true)));
  for (const w of winners) {
    const r = await db
      .insert(certificates)
      .values({ editionId, applicationId: w.id, kind: "winner", code: certificateCode(year), recipientName: w.name ?? w.email, college: w.college, detail: `Winning team: ${w.team}` })
      .onConflictDoNothing()
      .returning({ id: certificates.id });
    counts.winner += r.length;
  }
  const board = (await leaderboard(editionId)).filter((a) => a.status === "approved" && a.submitted > 0).slice(0, topAmbassadors);
  for (const [i, a] of board.entries()) {
    const r = await db
      .insert(certificates)
      .values({ editionId, ambassadorId: a.id, kind: "ambassador", code: certificateCode(year), recipientName: a.fullName, college: a.college, detail: `Ranked #${i + 1} with ${a.submitted} applications referred` })
      .onConflictDoNothing()
      .returning({ id: certificates.id });
    counts.ambassador += r.length;
  }
  await audit({ actorEmail, action: "certificates.issued", entity: "edition", entityId: editionId, after: counts });
  return counts;
}

/** Email each new certificate holder a download link. Idempotent per certificate. */
export async function emailCertificates(editionId: string) {
  const db = adminDb();
  const rows = await db
    .select({ c: certificates, email: sql<string | null>`coalesce((select ap.email from app.applications a join app.applicants ap on ap.id = a.applicant_id where a.id = ${certificates.applicationId}), (select am.email from app.ambassadors am where am.id = ${certificates.ambassadorId}))` })
    .from(certificates)
    .where(and(eq(certificates.editionId, editionId), sql`${certificates.revokedAt} is null`));
  let queued = 0;
  for (const { c, email } of rows) {
    if (!email) continue;
    const id = await enqueueEmail({
      idempotencyKey: `certificate:${c.id}`,
      to: email,
      template: "certificate_ready",
      email: {
        subject: "Your Bharat Yuva certificate",
        html: null,
        text: `Hi ${c.recipientName},\n\nYour certificate is ready. Download it here: ${appUrl()}/certificates/${c.code}.pdf\n\nAnyone can check it's genuine at ${appUrl()}/verify/${c.code}\n\nCongratulations,\nTeam Bharat Yuva`,
      },
      relatedEntity: "certificate",
      relatedId: c.id,
    });
    if (id) queued += 1;
  }
  return queued;
}

export async function findCertificate(code: string) {
  if (!/^BY\d{2}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) return null;
  const [row] = await adminDb()
    .select({ c: certificates, edition: editions })
    .from(certificates)
    .innerJoin(editions, eq(editions.id, certificates.editionId))
    .where(eq(certificates.code, code))
    .limit(1);
  return row ?? null;
}

export async function certificatePdf(code: string) {
  const row = await findCertificate(code);
  if (!row || row.c.revokedAt) return null;
  return renderCertificatePdf({
    kind: row.c.kind,
    recipientName: row.c.recipientName,
    college: row.c.college,
    editionName: row.edition.name,
    dates: formatDayRange(row.edition),
    detail: row.c.detail,
    code: row.c.code,
    verifyUrl: `${appUrl()}/verify/${row.c.code}`,
    issuedOn: formatDate(row.c.issuedAt),
  });
}

export async function revokeCertificate(id: string, actorEmail: string) {
  await adminDb().update(certificates).set({ revokedAt: new Date() }).where(eq(certificates.id, id));
  await audit({ actorEmail, action: "certificate.revoked", entity: "certificate", entityId: id });
}

// ---------------------------------------------------------------- Submissions and compendium

export async function createSubmissionUpload(user: SessionUser, applicationId: string, size: number) {
  const info = await fellowEventInfo(user, applicationId);
  if (!info?.team || size <= 0 || size > 15 * 1024 * 1024) return null;
  const path = `submissions/${info.edition.slug}/${info.team.id}-${Date.now()}.pdf`;
  const { data, error } = await supabaseService().storage.from("documents").createSignedUploadUrl(path);
  if (error || !data) return null;
  return { path: data.path, token: data.token, teamId: info.team.id };
}

export async function recordSubmission(user: SessionUser, input: { applicationId: string; path: string; fileName: string; title: string; abstract: string }) {
  const info = await fellowEventInfo(user, input.applicationId);
  if (!info?.team || !input.path.startsWith(`submissions/${info.edition.slug}/${info.team.id}-`)) return false;
  await adminDb()
    .insert(submissions)
    .values({ teamId: info.team.id, title: input.title.slice(0, 200), abstract: input.abstract.slice(0, 3000) || null, filePath: input.path, fileName: input.fileName.slice(0, 200), submittedBy: input.applicationId });
  await audit({ actorEmail: user.email, action: "submission.uploaded", entity: "team", entityId: info.team.id });
  return true;
}

export async function signedDocumentUrl(path: string, seconds = 300) {
  const { data } = await supabaseService().storage.from("documents").createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

/** Latest submission per team, in team order, merged into one PDF with a cover and contents. */
export async function compendiumPdf(editionId: string, title: string, intro: string) {
  const db = adminDb();
  const [edition] = await db.select().from(editions).where(eq(editions.id, editionId)).limit(1);
  if (!edition) return null;
  const teamRows = await db.select().from(teams).where(eq(teams.editionId, editionId)).orderBy(asc(teams.number));
  const entries: CompendiumEntry[] = [];
  for (const t of teamRows) {
    const [sub] = await db.select().from(submissions).where(eq(submissions.teamId, t.id)).orderBy(desc(submissions.createdAt)).limit(1);
    if (!sub) continue;
    const members = await db
      .select({ name: applicants.fullName })
      .from(teamMembers)
      .innerJoin(applications, eq(applications.id, teamMembers.applicationId))
      .innerJoin(applicants, eq(applicants.id, applications.applicantId))
      .where(eq(teamMembers.teamId, t.id));
    const { data } = await supabaseService().storage.from("documents").download(sub.filePath);
    entries.push({
      teamName: t.name,
      title: sub.title,
      abstract: sub.abstract,
      members: members.map((m) => m.name ?? "").filter(Boolean),
      pdf: data ? new Uint8Array(await data.arrayBuffer()) : null,
    });
  }
  return renderCompendium({ editionName: edition.name, dates: formatDayRange(edition), title, intro, entries });
}

// ---------------------------------------------------------------- Partner thank-yous

/** Queue a thank-you from the owner's Gmail to a confirmed partner, with the photo link. */
export async function queueThankYou(partnershipId: string, actorEmail: string, personalLine: string) {
  const ctx = await outreachContext(partnershipId);
  if (!ctx || ctx.p.stage !== "confirmed" || !ctx.contact?.email) return { ok: false as const, error: "Partner must be confirmed and have an email address." };
  const rendered = await renderOutreach(ctx, "thank_you", personalLine);
  if (!rendered) return { ok: false as const, error: "No thank-you template." };
  // The thank-you template puts the photo album where outreach puts the poster.
  const body = ctx.p.thankYouPhotosUrl ? rendered.body.replace(/https?:\/\/\S+\/p\/[A-Za-z0-9_-]+/, ctx.p.thankYouPhotosUrl) : rendered.body;
  if (/\{\{\s*[a-z_]+\s*\}\}/.test(rendered.subject + body)) return { ok: false as const, error: "Add a photo album link and a personal line first." };
  await adminDb()
    .insert(outboundMessages)
    .values({
      channel: "gmail",
      idempotencyKey: `thank-you:${partnershipId}`,
      toAddress: ctx.contact.email,
      subject: rendered.subject,
      bodyText: body,
      template: `thank_you_${ctx.org.type}`,
      senderEmail: ctx.p.ownerEmail ?? actorEmail,
      relatedEntity: "partnership",
      relatedId: partnershipId,
      meta: { partnershipId, step: "thank_you" },
    })
    .onConflictDoNothing({ target: outboundMessages.idempotencyKey });
  await audit({ actorEmail, action: "partner.thank_you_queued", entity: "partnership", entityId: partnershipId });
  return { ok: true as const };
}

export async function confirmedPartners(editionId: string) {
  return adminDb()
    .select({ id: partnerships.id, stage: partnerships.stage, photos: partnerships.thankYouPhotosUrl, personalLine: partnerships.personalLine })
    .from(partnerships)
    .where(and(eq(partnerships.editionId, editionId), eq(partnerships.stage, "confirmed")));
}

