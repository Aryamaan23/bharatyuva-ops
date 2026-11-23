"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { runOfShow, teamMembers, teams } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { formTeams, teamCountFor } from "@/server/domain/teams";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { kickDelivery } from "@/server/messaging/send";
import { audit } from "@/server/privileged/audit";
import { checkIn, confirmedPartners, emailCertificates, issueCertificates, queueThankYou, revokeCertificate, type CheckinResult } from "@/server/privileged/event";
import { startNextEdition } from "@/server/privileged/next-edition";
import { fellowsWithTeams } from "./queries";

async function edition() {
  const session = await requireStaff();
  const e = await getCurrentEditionForStaff(session);
  if (!e) throw new Error("No current edition");
  return { session, edition: e };
}

/** Replace all teams with balanced ones (discipline, state, gender). */
export async function formTeamsAction(formData: FormData): Promise<void> {
  const { session, edition: e } = await edition();
  const size = z.coerce.number().int().min(2).max(20).parse(formData.get("size"));
  const { fellows } = await fellowsWithTeams(session, e.id);
  const groups = formTeams(fellows.map((f) => ({ id: f.id, discipline: f.discipline, state: f.state, gender: f.gender })), teamCountFor(fellows.length, size));
  await withUserDb(session.claims, async (tx) => {
    await tx.delete(teams).where(eq(teams.editionId, e.id));
    for (const [i, ids] of groups.entries()) {
      if (ids.length === 0) continue;
      const [t] = await tx.insert(teams).values({ editionId: e.id, number: i + 1, name: `Team ${i + 1}` }).returning({ id: teams.id });
      await tx.insert(teamMembers).values(ids.map((applicationId) => ({ teamId: t!.id, applicationId })));
    }
  });
  await audit({ actorEmail: session.email, action: "teams.formed", entity: "edition", entityId: e.id, after: { teams: groups.length, fellows: fellows.length } });
  revalidatePath("/admin/event/teams");
}

export async function moveMemberAction(formData: FormData): Promise<void> {
  const { session } = await edition();
  const d = z.object({ applicationId: z.uuid(), teamId: z.uuid() }).parse(Object.fromEntries(formData));
  await withUserDb(session.claims, (tx) =>
    tx.insert(teamMembers).values(d).onConflictDoUpdate({ target: teamMembers.applicationId, set: { teamId: d.teamId } }),
  );
  revalidatePath("/admin/event/teams");
}

export async function updateTeamAction(formData: FormData): Promise<void> {
  const { session } = await edition();
  const d = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80), mentor: z.string().max(120).optional(), isWinner: z.enum(["on"]).optional() }).parse(Object.fromEntries(formData));
  await withUserDb(session.claims, (tx) => tx.update(teams).set({ name: d.name, mentor: d.mentor || null, isWinner: Boolean(d.isWinner) }).where(eq(teams.id, d.id)));
  if (d.isWinner) await audit({ actorEmail: session.email, action: "team.marked_winner", entity: "team", entityId: d.id });
  revalidatePath("/admin/event/teams");
}

const rosSchema = z.object({
  day: z.coerce.number().int().min(1).max(3),
  startsAt: z.string().regex(/^\d{2}:\d{2}$/),
  endsAt: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")),
  title: z.string().trim().min(2).max(200),
  location: z.string().max(200).optional(),
  ownerEmail: z.string().max(254).optional(),
  notes: z.string().max(1000).optional(),
});

export async function addRunOfShowAction(formData: FormData): Promise<void> {
  const { session, edition: e } = await edition();
  const d = rosSchema.parse(Object.fromEntries(formData));
  await withUserDb(session.claims, (tx) => tx.insert(runOfShow).values({ editionId: e.id, ...d, endsAt: d.endsAt || null, location: d.location || null, ownerEmail: d.ownerEmail || null, notes: d.notes || null }));
  revalidatePath("/admin/event/run-of-show");
}

export async function deleteRunOfShowAction(formData: FormData): Promise<void> {
  const { session } = await edition();
  const id = z.uuid().parse(formData.get("id"));
  await withUserDb(session.claims, (tx) => tx.delete(runOfShow).where(eq(runOfShow.id, id)));
  revalidatePath("/admin/event/run-of-show");
}

const checkinSchema = z.object({ token: z.string().max(200).optional(), applicationId: z.uuid().optional(), day: z.number().int().min(1).max(3), clientId: z.string().max(64).optional() });

/** Called by the scanner (also when syncing scans made offline). */
export async function checkInAction(input: z.input<typeof checkinSchema>): Promise<CheckinResult> {
  const { session, edition: e } = await edition();
  const d = checkinSchema.parse(input);
  return checkIn({ ...d, staffEmail: session.email, editionId: e.id });
}

export async function issueCertificatesAction(): Promise<{ message: string }> {
  const session = await requireStaff(ADMIN_ROLES);
  const e = await getCurrentEditionForStaff(session);
  if (!e) return { message: "No current edition." };
  const r = await issueCertificates(e.id, session.email);
  revalidatePath("/admin/event/certificates");
  return { message: `Issued ${r.participation} participation, ${r.winner} winner and ${r.ambassador} ambassador certificates.` };
}

export async function emailCertificatesAction(): Promise<{ message: string }> {
  const session = await requireStaff(ADMIN_ROLES);
  const e = await getCurrentEditionForStaff(session);
  if (!e) return { message: "No current edition." };
  const n = await emailCertificates(e.id);
  kickDelivery(500);
  await audit({ actorEmail: session.email, action: "certificates.emailed", entity: "edition", entityId: e.id, after: { queued: n } });
  return { message: `Queued ${n} certificate emails (each person is emailed once).` };
}

export async function revokeCertificateAction(formData: FormData): Promise<void> {
  const session = await requireStaff(ADMIN_ROLES);
  await revokeCertificate(z.uuid().parse(formData.get("id")), session.email);
  revalidatePath("/admin/event/certificates");
}

export async function thankYouAllAction(): Promise<{ message: string }> {
  const { session, edition: e } = await edition();
  const partners = await confirmedPartners(e.id);
  const results = await Promise.all(partners.map((p) => queueThankYou(p.id, session.email, p.personalLine ?? "Thank you for everything your team did to make the day work so well.")));
  const ok = results.filter((r) => r.ok).length;
  kickDelivery(50);
  const failed = results.length - ok;
  return { message: `Queued ${ok} thank-you notes from the owners' Gmail${failed ? `; ${failed} skipped (missing photo link, contact or personal line)` : ""}.` };
}

export async function startNextEditionAction(formData: FormData): Promise<void> {
  const session = await requireStaff(ADMIN_ROLES);
  const d = z.object({ fromId: z.uuid(), name: z.string().trim().min(3).max(120), slug: z.string().regex(/^[a-z0-9-]{3,40}$/) }).parse(Object.fromEntries(formData));
  const next = await startNextEdition(d.fromId, { name: d.name, slug: d.slug }, session.email);
  redirect(`/admin/editions/${next.id}` as never);
}

