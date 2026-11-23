import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { adminDb } from "@/server/db/admin";
import { editions, formDefinitions, organisations, partnerships, rubrics, tasks, taskTemplates } from "@/server/db/schema";
import { audit } from "./audit";

/**
 * "Start next edition": copy settings, the latest form, the rubric and the timeline (as a
 * template, re-dated once Day 1 is set), and put every organisation that isn't do-not-contact
 * back in the pipeline, flagging past partners. Applications are not copied.
 */
export async function startNextEdition(fromId: string, input: { name: string; slug: string }, actorEmail: string) {
  const db = adminDb();
  const [from] = await db.select().from(editions).where(eq(editions.id, fromId)).limit(1);
  if (!from) throw new Error("Edition not found");
  return db.transaction(async (tx) => {
    const [next] = await tx
      .insert(editions)
      .values({
        slug: input.slug,
        name: input.name,
        status: "draft",
        seatConfirmHours: from.seatConfirmHours,
        seats: from.seats,
        retentionMonths: from.retentionMonths,
        minAge: from.minAge,
        contactEmail: from.contactEmail,
        posterUrls: from.posterUrls,
        postSelectionDocuments: from.postSelectionDocuments,
      })
      .returning();
    const [form] = await tx.select().from(formDefinitions).where(and(eq(formDefinitions.editionId, fromId), isNotNull(formDefinitions.publishedAt))).orderBy(desc(formDefinitions.version)).limit(1);
    if (form) await tx.insert(formDefinitions).values({ editionId: next!.id, version: 1, definition: form.definition, createdBy: actorEmail });
    const [rubric] = await tx.select().from(rubrics).where(eq(rubrics.editionId, fromId)).limit(1);
    if (rubric) await tx.insert(rubrics).values({ editionId: next!.id, criteria: rubric.criteria, updatedBy: actorEmail });
    const timeline = await tx.select().from(tasks).where(and(eq(tasks.editionId, fromId), eq(tasks.kind, "timeline"), isNotNull(tasks.offsetDays)));
    if (timeline.length) {
      await tx.insert(taskTemplates).values({ name: `${from.name} timeline`, tasks: timeline.map((t) => ({ title: t.title, offsetDays: t.offsetDays!, ownerEmail: t.ownerEmail })), createdBy: actorEmail });
    }
    const confirmedBefore = await tx.selectDistinct({ orgId: partnerships.organisationId }).from(partnerships).where(eq(partnerships.stage, "confirmed"));
    const pastIds = new Set(confirmedBefore.map((r) => r.orgId));
    const orgs = await tx.select({ id: organisations.id }).from(organisations).where(eq(organisations.doNotContact, false));
    const prev = await tx.select().from(partnerships).where(eq(partnerships.editionId, fromId));
    for (const o of orgs) {
      const old = prev.find((p) => p.organisationId === o.id);
      await tx
        .insert(partnerships)
        .values({
          editionId: next!.id,
          organisationId: o.id,
          temperature: pastIds.has(o.id) ? "hot" : (old?.temperature ?? "cold"),
          ownerEmail: old?.ownerEmail ?? null,
          primaryContactId: old?.primaryContactId ?? null,
          pastPartner: pastIds.has(o.id),
        })
        .onConflictDoNothing();
    }
    await audit({ actorEmail, action: "edition.started_next", entity: "edition", entityId: next!.id, after: { from: fromId, partners: orgs.length } });
    return next!;
  });
}

