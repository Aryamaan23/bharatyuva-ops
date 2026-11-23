"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/lib/env";
import { suggestPersonalLine } from "@/server/ai/prompts";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { activities, contacts, emailTemplates, organisations, partnerships, partnerStage, sequenceSteps, tasks, temperature } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { todayIst } from "@/server/domain/sequences";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { kickDelivery } from "@/server/messaging/send";
import { audit } from "@/server/privileged/audit";
import { setGmailDailyCap } from "@/server/privileged/gmail";
import { approveOutreachStep, applyInbound, type ApproveResult } from "@/server/privileged/outreach";
import { createPartnerLink, revokePartnerLinks } from "@/server/privileged/partners";
import { commitImport, previewImport, type ColumnMapping, type ImportSummary, type SheetPreview } from "./import";

const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an .xlsx file." } as const;
  if (file.size > MAX_IMPORT_BYTES) return { error: "File is larger than 4 MB." } as const;
  if (!/\.xlsx$/i.test(file.name)) return { error: "Only .xlsx files are supported." } as const;
  return { file, buffer: await file.arrayBuffer() } as const;
}

const overridesSchema = z.record(z.string(), z.record(z.string(), z.number().int().min(0).max(60)));

function parseOverrides(raw: FormDataEntryValue | null): Record<string, ColumnMapping> {
  if (typeof raw !== "string" || !raw) return {};
  const parsed = overridesSchema.safeParse(JSON.parse(raw));
  return parsed.success ? (parsed.data as Record<string, ColumnMapping>) : {};
}

export type ImportPreviewResult = { ok: true; sheets: SheetPreview[] } | { ok: false; error: string };

export async function importPreviewAction(formData: FormData): Promise<ImportPreviewResult> {
  const session = await requireStaff(ADMIN_ROLES);
  const upload = await readUpload(formData);
  if ("error" in upload) return { ok: false, error: upload.error! };
  try {
    return { ok: true, sheets: await previewImport(session, upload.buffer, parseOverrides(formData.get("overrides"))) };
  } catch {
    return { ok: false, error: "Couldn't read that workbook. Is it a valid .xlsx file?" };
  }
}

export type ImportCommitResult = { ok: true; summary: ImportSummary } | { ok: false; error: string };

export async function importCommitAction(formData: FormData): Promise<ImportCommitResult> {
  const session = await requireStaff(ADMIN_ROLES);
  const upload = await readUpload(formData);
  if ("error" in upload) return { ok: false, error: upload.error! };
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return { ok: false, error: "No current edition. Create one first." };
  const summary = await commitImport(session, { fileName: upload.file.name, buffer: upload.buffer, overrides: parseOverrides(formData.get("overrides")), editionId: edition.id });
  revalidatePath("/admin/outreach");
  return { ok: true, summary };
}

const scheduleSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  owner: z.email().optional(),
});

/** Put partners into the outreach sequence: creates their first-email step (or a manual task). */
export async function scheduleFirstEmails(input: z.input<typeof scheduleSchema>): Promise<{ scheduled: number; skipped: number }> {
  const session = await requireStaff();
  const { ids, dueAt = todayIst(), owner } = scheduleSchema.parse(input);
  let scheduled = 0;
  let skipped = 0;
  await withUserDb(session.claims, async (tx) => {
    const rows = await tx
      .select({ p: partnerships, org: organisations })
      .from(partnerships)
      .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
      .where(inArray(partnerships.id, ids));
    for (const { p, org } of rows) {
      if (org.doNotContact || p.stage !== "not_contacted") {
        skipped += 1;
        continue;
      }
      const ownerEmail = owner ?? p.ownerEmail ?? session.email;
      await tx.update(partnerships).set({ ownerEmail, nextActionAt: dueAt }).where(eq(partnerships.id, p.id));
      const orgContacts = await tx.select({ email: contacts.email, bouncedAt: contacts.bouncedAt }).from(contacts).where(eq(contacts.organisationId, org.id));
      const hasEmail = orgContacts.some((c) => c.email && !c.bouncedAt);
      if (!hasEmail) {
        await tx
          .insert(tasks)
          .values({ editionId: p.editionId, title: `Find a way to reach ${org.name} (no email)`, kind: "manual_contact", ownerEmail, dueAt, partnershipId: p.id, sourceKey: `manual:${p.id}` })
          .onConflictDoUpdate({ target: [tasks.editionId, tasks.sourceKey], set: { ownerEmail, dueAt } });
      } else {
        await tx
          .insert(sequenceSteps)
          .values({ partnershipId: p.id, step: "first", dueAt })
          .onConflictDoUpdate({ target: [sequenceSteps.partnershipId, sequenceSteps.step], set: { dueAt }, where: eq(sequenceSteps.status, "pending") });
      }
      await tx.insert(activities).values({ partnershipId: p.id, kind: "scheduled", body: `First email scheduled for ${dueAt}`, actorEmail: session.email });
      scheduled += 1;
    }
  });
  await audit({ actorEmail: session.email, action: "outreach.scheduled", entity: "edition", entityId: null, after: { count: scheduled } });
  revalidatePath("/admin/outreach");
  return { scheduled, skipped };
}

const bulkSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  owner: z.string().optional(),
  temperature: z.enum(temperature.enumValues).optional(),
});

export async function bulkUpdatePartnerships(input: z.input<typeof bulkSchema>) {
  const session = await requireStaff();
  const { ids, owner, temperature: temp } = bulkSchema.parse(input);
  const set: Partial<typeof partnerships.$inferInsert> = {};
  if (owner !== undefined) set.ownerEmail = owner === "none" ? null : owner;
  if (temp) set.temperature = temp;
  if (Object.keys(set).length === 0) return;
  await withUserDb(session.claims, (tx) => tx.update(partnerships).set(set).where(inArray(partnerships.id, ids)));
  await audit({ actorEmail: session.email, action: "partnerships.bulk_updated", entity: "partnership", entityId: null, after: { ids: ids.length, ...set } });
  revalidatePath("/admin/outreach");
}

const updateSchema = z.object({
  id: z.uuid(),
  stage: z.enum(partnerStage.enumValues).optional(),
  temperature: z.enum(temperature.enumValues).optional(),
  ownerEmail: z.string().max(254).optional(),
  nextActionAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).optional(),
  personalLine: z.string().max(400).optional(),
  dayPlan: z.string().max(4000).optional(),
  nodalName: z.string().max(120).optional(),
  nodalRole: z.string().max(120).optional(),
  nodalPhone: z.string().max(40).optional(),
  nodalEmail: z.string().max(254).optional(),
  thankYouPhotosUrl: z.url().or(z.literal("")).optional(),
});

export async function updatePartnership(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const d = updateSchema.parse(Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$"))));
  await withUserDb(session.claims, async (tx) => {
    const [before] = await tx.select().from(partnerships).where(eq(partnerships.id, d.id)).limit(1);
    if (!before) return;
    const set: Partial<typeof partnerships.$inferInsert> = {};
    if (d.stage && d.stage !== before.stage) {
      set.stage = d.stage;
      if (d.stage === "confirmed") set.confirmedAt = new Date();
    }
    if (d.temperature) set.temperature = d.temperature;
    if (d.ownerEmail !== undefined) set.ownerEmail = d.ownerEmail || null;
    if (d.nextActionAt !== undefined) set.nextActionAt = d.nextActionAt || null;
    if (d.personalLine !== undefined) set.personalLine = d.personalLine.trim() || null;
    if (d.dayPlan !== undefined) set.dayPlan = d.dayPlan || null;
    if (d.thankYouPhotosUrl !== undefined) set.thankYouPhotosUrl = d.thankYouPhotosUrl || null;
    if (d.nodalName !== undefined) {
      set.nodalOfficer = { name: d.nodalName, role: d.nodalRole, phone: d.nodalPhone, email: d.nodalEmail };
    }
    await tx.update(partnerships).set(set).where(eq(partnerships.id, d.id));
    if (set.stage) {
      await tx.insert(activities).values({ partnershipId: d.id, kind: "stage_change", body: `${before.stage} → ${set.stage}`, actorEmail: session.email });
      if (["in_discussion", "confirmed", "declined", "do_not_contact"].includes(set.stage)) {
        await tx
          .update(sequenceSteps)
          .set({ status: "stopped" })
          .where(and(eq(sequenceSteps.partnershipId, d.id), eq(sequenceSteps.status, "pending")));
      }
      if (set.stage === "do_not_contact") {
        await tx.update(organisations).set({ doNotContact: true, doNotContactReason: `Set by ${session.email}` }).where(eq(organisations.id, before.organisationId));
      }
    }
    if (set.stage) {
      await audit({ actorEmail: session.email, action: "partnership.stage_changed", entity: "partnership", entityId: d.id, before: { stage: before.stage }, after: { stage: set.stage } });
    }
  });
  revalidatePath(`/admin/outreach/${d.id}`);
}

export async function addPartnerNote(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const d = z.object({ id: z.uuid(), body: z.string().trim().min(1).max(4000), kind: z.enum(["note", "call"]).default("note") }).parse(Object.fromEntries(formData));
  await withUserDb(session.claims, (tx) => tx.insert(activities).values({ partnershipId: d.id, kind: d.kind, body: d.body, actorEmail: session.email }));
  revalidatePath(`/admin/outreach/${d.id}`);
}

export async function addContact(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const d = z
    .object({
      partnershipId: z.uuid(),
      organisationId: z.uuid(),
      name: z.string().max(120).optional(),
      roleTitle: z.string().max(160).optional(),
      email: z.email().or(z.literal("")).optional(),
      phone: z.string().max(40).optional(),
      primary: z.enum(["on"]).optional(),
    })
    .parse(Object.fromEntries(formData));
  await withUserDb(session.claims, async (tx) => {
    const [c] = await tx
      .insert(contacts)
      .values({ organisationId: d.organisationId, name: d.name || null, roleTitle: d.roleTitle || null, email: d.email?.toLowerCase() || null, phone: d.phone || null, channel: d.email ? "email" : "phone" })
      .returning({ id: contacts.id });
    if (d.primary) await tx.update(partnerships).set({ primaryContactId: c!.id }).where(eq(partnerships.id, d.partnershipId));
    await tx.insert(activities).values({ partnershipId: d.partnershipId, kind: "contact_added", body: [d.name, d.roleTitle, d.email].filter(Boolean).join(" · "), actorEmail: session.email });
  });
  revalidatePath(`/admin/outreach/${d.partnershipId}`);
}

export async function setPrimaryContact(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const d = z.object({ partnershipId: z.uuid(), contactId: z.uuid() }).parse(Object.fromEntries(formData));
  await withUserDb(session.claims, (tx) => tx.update(partnerships).set({ primaryContactId: d.contactId }).where(eq(partnerships.id, d.partnershipId)));
  revalidatePath(`/admin/outreach/${d.partnershipId}`);
}

const approveSchema = z.object({
  stepId: z.uuid(),
  personalLine: z.string().max(400),
  subject: z.string().min(3).max(300),
  body: z.string().min(20).max(20000),
  verificationAcknowledged: z.boolean(),
});

export async function approveStepAction(input: z.input<typeof approveSchema>): Promise<ApproveResult> {
  const session = await requireStaff();
  const d = approveSchema.parse(input);
  // No revalidate here: the card shows its own "approved" state, and refreshing the list would
  // remove the card before the person sees the confirmation. The queue is fresh on next visit.
  return approveOutreachStep({ ...d, actorEmail: session.email });
}

export async function skipStepAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const stepId = z.uuid().parse(formData.get("stepId"));
  await withUserDb(session.claims, async (tx) => {
    const [s] = await tx.update(sequenceSteps).set({ status: "skipped" }).where(and(eq(sequenceSteps.id, stepId), eq(sequenceSteps.status, "pending"))).returning();
    if (s) await tx.insert(activities).values({ partnershipId: s.partnershipId, kind: "step_skipped", body: s.step, actorEmail: session.email });
  });
  revalidatePath("/admin/outreach/queue");
}

export type SuggestResult = { ok: true; text: string } | { ok: false; error: string };

export async function suggestLineAction(partnershipId: string): Promise<SuggestResult> {
  const session = await requireStaff();
  if (!z.uuid().safeParse(partnershipId).success) return { ok: false, error: "Invalid partner" };
  const data = await withUserDb(session.claims, async (tx) => {
    const [row] = await tx
      .select({ p: partnerships, org: organisations })
      .from(partnerships)
      .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
      .where(eq(partnerships.id, partnershipId))
      .limit(1);
    const recent = await tx.select({ kind: activities.kind, body: activities.body }).from(activities).where(eq(activities.partnershipId, partnershipId)).orderBy(desc(activities.at)).limit(5);
    return row ? { ...row, recent } : null;
  });
  if (!data) return { ok: false, error: "Partner not found" };
  const res = await suggestPersonalLine({
    partnershipId,
    actorEmail: session.email,
    partnerType: data.org.type,
    orgName: data.org.name,
    location: data.org.location,
    fitReason: data.org.fitReason,
    suggestedApproach: data.org.suggestedApproach,
    notes: data.org.notes,
    pastPartner: data.p.pastPartner,
    recentActivity: data.recent.filter((a) => ["note", "call", "reply"].includes(a.kind)).map((a) => `${a.kind}: ${(a.body ?? "").slice(0, 160)}`),
  });
  if (res.ok) return res;
  const messages = { not_configured: "AI isn't configured (ANTHROPIC_API_KEY).", refused: "The AI declined this one. Please write the line yourself.", rate_limited: "AI is busy. Try again in a minute.", failed: "AI suggestion failed. Please write the line yourself." };
  return { ok: false, error: messages[res.error] };
}

export async function saveTemplateAction(formData: FormData): Promise<void> {
  const session = await requireStaff(ADMIN_ROLES);
  const d = z.object({ id: z.uuid(), subject: z.string().min(3).max(300), body: z.string().min(20).max(20000) }).parse(Object.fromEntries(formData));
  await withUserDb(session.claims, async (tx) => {
    const [t] = await tx.select({ version: emailTemplates.version }).from(emailTemplates).where(eq(emailTemplates.id, d.id)).limit(1);
    await tx.update(emailTemplates).set({ subject: d.subject, body: d.body, version: (t?.version ?? 1) + 1, updatedBy: session.email }).where(eq(emailTemplates.id, d.id));
  });
  await audit({ actorEmail: session.email, action: "template.updated", entity: "email_template", entityId: d.id });
  revalidatePath("/admin/outreach/templates");
}

export async function createPartnerLinkAction(partnershipId: string, contactEmail: string | null): Promise<{ url: string }> {
  const session = await requireStaff();
  z.uuid().parse(partnershipId);
  const url = await createPartnerLink(partnershipId, contactEmail, session.email);
  revalidatePath(`/admin/outreach/${partnershipId}`);
  return { url };
}

export async function revokePartnerLinksAction(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = z.uuid().parse(formData.get("partnershipId"));
  await revokePartnerLinks(id, session.email);
  revalidatePath(`/admin/outreach/${id}`);
}

/** Development only: exercise reply detection without a real Gmail thread. */
export async function simulateReplyAction(formData: FormData): Promise<void> {
  if (env().VERCEL_ENV === "production") return;
  const session = await requireStaff();
  const d = z.object({ partnershipId: z.uuid(), body: z.string().min(1).max(2000), from: z.string().max(200) }).parse(Object.fromEntries(formData));
  await applyInbound(d.partnershipId, { from: d.from, subject: "Re: (simulated)", body: d.body }, session.email);
  kickDelivery(10);
  revalidatePath(`/admin/outreach/${d.partnershipId}`);
}

export async function setDailyCapAction(formData: FormData): Promise<void> {
  const session = await requireStaff(ADMIN_ROLES);
  const d = z.object({ staffEmail: z.email(), cap: z.coerce.number().int().min(1).max(100) }).parse(Object.fromEntries(formData));
  await setGmailDailyCap(d.staffEmail, d.cap, session.email);
  revalidatePath("/admin/settings/gmail");
}
