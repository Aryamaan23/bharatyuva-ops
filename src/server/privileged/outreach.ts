import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { env } from "@/lib/env";
import { adminDb } from "@/server/db/admin";
import {
  activities,
  contacts,
  editions,
  emailTemplates,
  gmailThreads,
  organisations,
  outboundMessages,
  partnerships,
  sequenceSteps,
  shortLinks,
  staffMembers,
  tasks,
  type PartnerType,
  type SequenceStepKind,
} from "@/server/db/schema";
import { formatDate, formatDayRange } from "@/server/domain/editions";
import { defaultSignature, renderTemplate, salutationFor, type MergeValues } from "@/server/domain/merge";
import { classifyReply, stripQuoted, type InboundMessage, type ReplyKind } from "@/server/domain/replies";
import { followUpDates, sequenceHalted, stageAfterSend, todayIst } from "@/server/domain/sequences";
import { remainingCap, spacedSendTimes } from "@/server/domain/spacing";
import { startOfIstDay } from "@/server/messaging/delivery";
import { enqueueEmail } from "@/server/messaging/outbox";
import { audit } from "./audit";
import { senderFor } from "./gmail";

const dayForType: Record<PartnerType, "day1Date" | "day2Date" | "day3Date" | null> = {
  university: "day1Date",
  district: "day2Date",
  embassy: "day3Date",
  other: null,
};

/** A short tracked link (/p/<code>) to a target URL; reused per partnership + label. */
export async function trackedLink(input: { targetUrl: string; label: string; partnershipId?: string; editionId?: string }) {
  const db = adminDb();
  const conds = [eq(shortLinks.label, input.label), eq(shortLinks.targetUrl, input.targetUrl)];
  if (input.partnershipId) conds.push(eq(shortLinks.partnershipId, input.partnershipId));
  const [existing] = await db.select().from(shortLinks).where(and(...conds)).limit(1);
  const code = existing?.code ?? randomBytes(5).toString("base64url");
  if (!existing) {
    await db.insert(shortLinks).values({ code, targetUrl: input.targetUrl, label: input.label, partnershipId: input.partnershipId, editionId: input.editionId });
  }
  return `${env().NEXT_PUBLIC_APP_URL}/p/${code}`;
}

/** Everything needed to render an outreach email for one partnership. */
export async function outreachContext(partnershipId: string) {
  const db = adminDb();
  const [row] = await db
    .select({ p: partnerships, org: organisations, edition: editions })
    .from(partnerships)
    .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
    .innerJoin(editions, eq(editions.id, partnerships.editionId))
    .where(eq(partnerships.id, partnershipId))
    .limit(1);
  if (!row) return null;
  const orgContacts = await db.select().from(contacts).where(eq(contacts.organisationId, row.org.id));
  const contact =
    orgContacts.find((c) => c.id === row.p.primaryContactId && c.email && !c.bouncedAt) ??
    orgContacts.find((c) => c.isPrimary && c.email && !c.bouncedAt) ??
    orgContacts.find((c) => c.email && !c.bouncedAt) ??
    null;
  const [owner] = row.p.ownerEmail
    ? await db.select().from(staffMembers).where(eq(staffMembers.email, row.p.ownerEmail)).limit(1)
    : [];
  return { ...row, contacts: orgContacts, contact, owner: owner ?? null };
}

export type OutreachContext = NonNullable<Awaited<ReturnType<typeof outreachContext>>>;

export async function mergeValues(ctx: OutreachContext, personalOverride?: string | null): Promise<Partial<MergeValues>> {
  const dayKey = dayForType[ctx.org.type];
  const dates = (dayKey && ctx.edition[dayKey] ? formatDate(ctx.edition[dayKey]!) : formatDayRange(ctx.edition)) ?? "";
  const posterTarget = ctx.edition.posterUrls[ctx.org.type as "university" | "district" | "embassy"] ?? ctx.edition.posterUrls.general;
  const poster = posterTarget
    ? await trackedLink({ targetUrl: posterTarget, label: `poster:${ctx.org.type}`, partnershipId: ctx.p.id, editionId: ctx.edition.id })
    : "";
  return {
    salutation: salutationFor(ctx.contact ?? {}, ctx.org.type),
    org: ctx.org.name,
    personal: (personalOverride ?? ctx.p.personalLine ?? "").trim(),
    edition: ctx.edition.name,
    dates,
    poster,
    signature: ctx.owner ? (ctx.owner.signature ?? defaultSignature(ctx.owner, ctx.edition.contactEmail)) : "",
  };
}

export async function renderOutreach(ctx: OutreachContext, step: SequenceStepKind | "thank_you", personal?: string | null) {
  const tplStep = step === "call" ? "fu2" : step;
  const [tpl] = await adminDb()
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.partnerType, ctx.org.type === "other" ? "university" : ctx.org.type), eq(emailTemplates.step, tplStep)))
    .limit(1);
  if (!tpl) return null;
  const values = await mergeValues(ctx, personal);
  const subject = renderTemplate(tpl.subject, values);
  const body = renderTemplate(tpl.body, values);
  return {
    subject: subject.text,
    body: body.text,
    missing: [...new Set([...subject.missing, ...body.missing])],
    unknown: [...new Set([...subject.unknown, ...body.unknown])],
  };
}

export type ApproveResult =
  | { ok: true; scheduledFor: Date }
  | { ok: false; error: "not_found" | "halted" | "do_not_contact" | "needs_verification" | "personal_required" | "no_contact" | "unmerged" | "cap_reached" | "no_sender"; detail?: string };

/**
 * Approve one outreach email: checks every guardrail, then queues it in the outbox from the
 * owner's Gmail with random spacing, within the owner's daily cap. Caller must be staff.
 */
export async function approveOutreachStep(input: {
  stepId: string;
  actorEmail: string;
  personalLine: string;
  subject: string;
  body: string;
  verificationAcknowledged: boolean;
}): Promise<ApproveResult> {
  const db = adminDb();
  const [step] = await db.select().from(sequenceSteps).where(eq(sequenceSteps.id, input.stepId)).limit(1);
  if (!step || step.status !== "pending" || step.step === "call") return { ok: false, error: "not_found" };
  const ctx = await outreachContext(step.partnershipId);
  if (!ctx) return { ok: false, error: "not_found" };
  if (ctx.org.doNotContact || ctx.p.stage === "do_not_contact") return { ok: false, error: "do_not_contact" };
  if (sequenceHalted(ctx.p.stage)) return { ok: false, error: "halted" };
  if (ctx.org.needsVerification && !ctx.p.verificationAcknowledgedAt && !input.verificationAcknowledged) {
    return { ok: false, error: "needs_verification" };
  }
  const personal = input.personalLine.trim();
  if (personal.length < 10) return { ok: false, error: "personal_required" };
  if (!ctx.contact?.email) return { ok: false, error: "no_contact" };
  if (/\{\{\s*[a-z_]+\s*\}\}/.test(input.subject + input.body)) return { ok: false, error: "unmerged", detail: "Fill every {{field}} before sending" };

  const senderEmail = ctx.p.ownerEmail ?? input.actorEmail;
  const sender = await senderFor(senderEmail);
  if ("error" in sender) return { ok: false, error: "no_sender", detail: sender.error };

  // Cap and spacing: count everything this sender has scheduled for today (IST).
  const now = new Date();
  const dayStart = startOfIstDay(now);
  const todays = await db
    .select({ notBefore: outboundMessages.notBefore })
    .from(outboundMessages)
    .where(
      and(
        eq(outboundMessages.channel, "gmail"),
        eq(outboundMessages.senderEmail, senderEmail),
        gte(outboundMessages.notBefore, dayStart),
        lte(outboundMessages.notBefore, new Date(dayStart.getTime() + 86_400_000)),
        ne(outboundMessages.status, "cancelled"),
      ),
    )
    .orderBy(desc(outboundMessages.notBefore));
  if (remainingCap(sender.dailyCap, todays.length) === 0) return { ok: false, error: "cap_reached" };
  const last = todays[0]?.notBefore;
  const start = last && last > now ? last : now;
  const [sendAt] = todays.length ? spacedSendTimes(2, start).slice(1) : [now];

  const attachments = ctx.org.type === "district" && (step.step === "first" || step.step === "fu1") ? [{ kind: "district_letter", partnershipId: ctx.p.id }] : [];

  await db.transaction(async (tx) => {
    await tx
      .update(partnerships)
      .set({
        personalLine: personal,
        ownerEmail: senderEmail,
        verificationAcknowledgedAt: ctx.p.verificationAcknowledgedAt ?? (input.verificationAcknowledged ? now : null),
      })
      .where(eq(partnerships.id, ctx.p.id));
    const [msg] = await tx
      .insert(outboundMessages)
      .values({
        channel: "gmail",
        idempotencyKey: `outreach:${step.id}`,
        toAddress: ctx.contact!.email!,
        subject: input.subject,
        bodyText: input.body,
        template: `outreach_${ctx.org.type}_${step.step}`,
        senderEmail,
        relatedEntity: "sequence_step",
        relatedId: step.id,
        notBefore: sendAt!,
        meta: { partnershipId: ctx.p.id, step: step.step },
        attachments,
      })
      .onConflictDoNothing({ target: outboundMessages.idempotencyKey })
      .returning({ id: outboundMessages.id });
    await tx
      .update(sequenceSteps)
      .set({ status: "queued", subject: input.subject, body: input.body, approvedBy: input.actorEmail, contactId: ctx.contact!.id, outboundMessageId: msg?.id ?? null })
      .where(eq(sequenceSteps.id, step.id));
    await tx.insert(activities).values({
      partnershipId: ctx.p.id,
      kind: "email_approved",
      body: input.subject,
      actorEmail: input.actorEmail,
      meta: { step: step.step, scheduledFor: sendAt!.toISOString() },
    });
  });
  await audit({ actorEmail: input.actorEmail, action: "outreach.approved", entity: "partnership", entityId: ctx.p.id, after: { step: step.step, to: ctx.contact.email } });
  return { ok: true, scheduledFor: sendAt! };
}

/** Called by the Gmail sender once Google accepted the message. */
export async function onOutreachSent(input: {
  stepId: string;
  partnershipId: string;
  senderEmail: string;
  gmailThreadId: string;
  rfcMessageId: string;
}) {
  const db = adminDb();
  const now = new Date();
  const [step] = await db.select().from(sequenceSteps).where(eq(sequenceSteps.id, input.stepId)).limit(1);
  const [p] = await db.select().from(partnerships).where(eq(partnerships.id, input.partnershipId)).limit(1);
  if (!step || !p) return;
  await db.update(sequenceSteps).set({ status: "sent", sentAt: now }).where(eq(sequenceSteps.id, step.id));
  await db.update(partnerships).set({ stage: stageAfterSend(p.stage, step.step) }).where(eq(partnerships.id, p.id));
  await db
    .insert(gmailThreads)
    .values({ partnershipId: p.id, senderEmail: input.senderEmail, gmailThreadId: input.gmailThreadId, lastRfcMessageId: input.rfcMessageId, lastSentAt: now })
    .onConflictDoUpdate({
      target: gmailThreads.partnershipId,
      set: { gmailThreadId: input.gmailThreadId, lastRfcMessageId: input.rfcMessageId, lastSentAt: now, senderEmail: input.senderEmail },
    });
  if (step.step === "first") {
    for (const f of followUpDates(todayIst(now))) {
      await db.insert(sequenceSteps).values({ partnershipId: p.id, step: f.step, dueAt: f.dueAt }).onConflictDoNothing();
    }
  }
  await db.insert(activities).values({ partnershipId: p.id, kind: "email_sent", body: step.subject, actorEmail: input.senderEmail, meta: { step: step.step } });
}

/** Stop every follow-up still waiting for this partnership. */
async function stopSequence(partnershipId: string) {
  await adminDb()
    .update(sequenceSteps)
    .set({ status: "stopped" })
    .where(and(eq(sequenceSteps.partnershipId, partnershipId), inArray(sequenceSteps.status, ["pending", "queued"])));
  // Cancel any approved-but-unsent follow-up in the outbox.
  await adminDb()
    .update(outboundMessages)
    .set({ status: "cancelled" })
    .where(and(eq(outboundMessages.channel, "gmail"), eq(outboundMessages.status, "pending"), sql`${outboundMessages.meta} ->> 'partnershipId' = ${partnershipId}`));
}

/**
 * Apply a message that arrived on an outreach thread: a reply stops the sequence and moves the
 * partner to "In discussion"; "no" marks Do-not-contact; a bounce flags the address.
 */
export async function applyInbound(partnershipId: string, msg: InboundMessage, actor = "system"): Promise<ReplyKind> {
  const db = adminDb();
  const kind = classifyReply(msg);
  if (kind === "auto_reply") return kind;
  const ctx = await outreachContext(partnershipId);
  if (!ctx) return kind;
  const now = new Date();
  const snippet = stripQuoted(msg.body).slice(0, 500);

  if (kind === "bounce") {
    const [lastStep] = await db
      .select({ contactId: sequenceSteps.contactId })
      .from(sequenceSteps)
      .where(and(eq(sequenceSteps.partnershipId, partnershipId), eq(sequenceSteps.status, "sent")))
      .orderBy(desc(sequenceSteps.sentAt))
      .limit(1);
    if (lastStep?.contactId) await db.update(contacts).set({ bouncedAt: now }).where(eq(contacts.id, lastStep.contactId));
    await stopSequence(partnershipId);
    await db
      .insert(tasks)
      .values({
        editionId: ctx.edition.id,
        title: `Email bounced: find a new address for ${ctx.org.name}`,
        kind: "bounce",
        ownerEmail: ctx.p.ownerEmail,
        dueAt: todayIst(now),
        partnershipId,
        sourceKey: `bounce:${partnershipId}:${todayIst(now)}`,
      })
      .onConflictDoNothing();
  } else {
    await stopSequence(partnershipId);
    if (kind === "optout") {
      await db.update(organisations).set({ doNotContact: true, doNotContactReason: `Replied: "${snippet.slice(0, 120)}"` }).where(eq(organisations.id, ctx.org.id));
      await db.update(partnerships).set({ stage: "do_not_contact" }).where(eq(partnerships.id, partnershipId));
    } else if (!["confirmed", "declined"].includes(ctx.p.stage)) {
      await db.update(partnerships).set({ stage: "in_discussion" }).where(eq(partnerships.id, partnershipId));
    }
  }
  await db.update(gmailThreads).set({ replyDetectedAt: now, replyKind: kind }).where(eq(gmailThreads.partnershipId, partnershipId));
  await db.insert(activities).values({ partnershipId, kind: kind === "reply" ? "reply" : kind, body: snippet, actorEmail: actor, meta: { from: msg.from, subject: msg.subject } });
  await audit({ actorEmail: actor, action: `outreach.${kind}`, entity: "partnership", entityId: partnershipId });

  if (ctx.p.ownerEmail) {
    const label = kind === "reply" ? "replied" : kind === "optout" ? "asked not to be contacted" : "bounced";
    await enqueueEmail({
      idempotencyKey: `owner-notify:${kind}:${partnershipId}:${now.toISOString().slice(0, 13)}`,
      to: ctx.p.ownerEmail,
      template: "owner_notification",
      email: {
        subject: `${ctx.org.name} ${label}`,
        html: null,
        text: `${ctx.org.name} ${label}.\n\n${snippet}\n\nOpen: ${env().NEXT_PUBLIC_APP_URL}/admin/outreach/${partnershipId}`,
      },
      relatedEntity: "partnership",
      relatedId: partnershipId,
    });
  }
  return kind;
}

/** Hourly: look for new messages on open outreach threads. Batched to fit a 60 s function. */
export async function checkReplies(limit = 40) {
  const db = adminDb();
  const threads = await db
    .select()
    .from(gmailThreads)
    .where(and(isNull(gmailThreads.replyDetectedAt), sql`${gmailThreads.lastCheckedAt} is null or ${gmailThreads.lastCheckedAt} < now() - interval '45 minutes'`))
    .orderBy(sql`${gmailThreads.lastCheckedAt} asc nulls first`)
    .limit(limit);
  const tally: Record<string, number> = { checked: 0, reply: 0, optout: 0, bounce: 0, auto_reply: 0, errors: 0 };
  for (const t of threads) {
    const sender = await senderFor(t.senderEmail);
    await db.update(gmailThreads).set({ lastCheckedAt: new Date() }).where(eq(gmailThreads.id, t.id));
    if ("error" in sender) {
      tally.errors! += 1;
      continue;
    }
    try {
      const messages = await sender.client.getThread(t.gmailThreadId);
      const ours = sender.fromAddress.toLowerCase();
      const incoming = messages
        .filter((m) => !m.from.toLowerCase().includes(ours) && (!t.lastSentAt || m.internalDate > new Date(t.lastSentAt.getTime() - 60_000)))
        .sort((a, b) => a.internalDate.getTime() - b.internalDate.getTime());
      for (const m of incoming) {
        const kind = await applyInbound(t.partnershipId, m);
        tally[kind] = (tally[kind] ?? 0) + 1;
        if (kind !== "auto_reply") break;
      }
      tally.checked! += 1;
    } catch {
      tally.errors! += 1;
    }
  }
  return tally;
}

/** Morning: turn due "call the office" steps into tasks; stop steps for halted partners. */
export async function processDueSteps(now = new Date()) {
  const db = adminDb();
  const today = todayIst(now);
  const due = await db
    .select({ step: sequenceSteps, p: partnerships, org: organisations })
    .from(sequenceSteps)
    .innerJoin(partnerships, eq(partnerships.id, sequenceSteps.partnershipId))
    .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
    .where(and(eq(sequenceSteps.status, "pending"), lte(sequenceSteps.dueAt, today)));
  let calls = 0;
  let stopped = 0;
  for (const { step, p, org } of due) {
    if (sequenceHalted(p.stage) || org.doNotContact) {
      await db.update(sequenceSteps).set({ status: "stopped" }).where(eq(sequenceSteps.id, step.id));
      stopped += 1;
      continue;
    }
    if (step.step === "call") {
      const phones = (await db.select({ phone: contacts.phone }).from(contacts).where(eq(contacts.organisationId, org.id))).map((c) => c.phone).filter(Boolean);
      await db
        .insert(tasks)
        .values({
          editionId: p.editionId,
          title: `Call the office: ${org.name}`,
          kind: "outreach_call",
          ownerEmail: p.ownerEmail,
          dueAt: today,
          partnershipId: p.id,
          sourceKey: `call:${p.id}`,
          checklist: [
            { label: `Call ${phones.join(" / ") || "the office (find the number on their website)"}`, done: false },
            { label: "Ask for the right person and their email", done: false },
            { label: "Log the outcome on the partner page", done: false },
          ],
        })
        .onConflictDoNothing();
      await db.update(sequenceSteps).set({ status: "done" }).where(eq(sequenceSteps.id, step.id));
      calls += 1;
    }
  }
  return { calls, stopped };
}
