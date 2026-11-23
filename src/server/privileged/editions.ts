import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { cache } from "react";
import { adminDb } from "@/server/db/admin";
import { consentVersions, editions, formDefinitions } from "@/server/db/schema";

export type Edition = typeof editions.$inferSelect;
export type PublishedForm = typeof formDefinitions.$inferSelect;
export type ConsentVersion = typeof consentVersions.$inferSelect;

/**
 * Public edition data (landing page, apply flow). Read with the privileged connection because
 * visitors may be signed out; only non-personal configuration is returned.
 */
export const getCurrentEdition = cache(async (): Promise<Edition | null> => {
  const [row] = await adminDb().select().from(editions).where(eq(editions.isCurrent, true)).limit(1);
  return row ?? null;
});

export async function getEditionById(id: string): Promise<Edition | null> {
  const [row] = await adminDb().select().from(editions).where(eq(editions.id, id)).limit(1);
  return row ?? null;
}

export const getPublishedForm = cache(async (editionId: string): Promise<PublishedForm | null> => {
  const [row] = await adminDb()
    .select()
    .from(formDefinitions)
    .where(and(eq(formDefinitions.editionId, editionId), isNotNull(formDefinitions.publishedAt)))
    .orderBy(desc(formDefinitions.version))
    .limit(1);
  return row ?? null;
});

export async function getFormVersion(editionId: string, version: number): Promise<PublishedForm | null> {
  const [row] = await adminDb()
    .select()
    .from(formDefinitions)
    .where(and(eq(formDefinitions.editionId, editionId), eq(formDefinitions.version, version)))
    .limit(1);
  return row ?? null;
}

/** Latest published version of each consent text. */
export const getCurrentConsents = cache(async () => {
  const rows = await adminDb().select().from(consentVersions).orderBy(desc(consentVersions.version));
  const latest = (kind: ConsentVersion["kind"]) => rows.find((r) => r.kind === kind) ?? null;
  return { processing: latest("processing"), whatsapp: latest("whatsapp"), guardian: latest("guardian") };
});
