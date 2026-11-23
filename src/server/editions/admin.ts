import "server-only";
import { desc, eq, max, ne } from "drizzle-orm";
import { formDefinitionSchema, type FormDefinition } from "@/lib/forms/definition";
import type { StaffSession } from "@/server/auth/session";
import { editions, formDefinitions } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";

export async function listEditions(session: StaffSession) {
  return withUserDb(session.claims, (tx) => tx.select().from(editions).orderBy(desc(editions.createdAt)));
}

export async function getEdition(session: StaffSession, id: string) {
  return withUserDb(session.claims, async (tx) => {
    const [row] = await tx.select().from(editions).where(eq(editions.id, id)).limit(1);
    return row ?? null;
  });
}

export async function getCurrentEditionForStaff(session: StaffSession) {
  return withUserDb(session.claims, async (tx) => {
    const [row] = await tx.select().from(editions).where(eq(editions.isCurrent, true)).limit(1);
    return row ?? null;
  });
}

export async function listFormVersions(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, (tx) =>
    tx
      .select()
      .from(formDefinitions)
      .where(eq(formDefinitions.editionId, editionId))
      .orderBy(desc(formDefinitions.version)),
  );
}

/** Make one edition current (the public site and apply flow use it). RLS limits this to admins. */
export async function setCurrentEdition(session: StaffSession, id: string) {
  await withUserDb(session.claims, async (tx) => {
    await tx.update(editions).set({ isCurrent: false }).where(ne(editions.id, id));
    await tx.update(editions).set({ isCurrent: true }).where(eq(editions.id, id));
  });
}

/**
 * Save a form definition as a new version. Published versions are never edited in place, so an
 * applicant who started on version N always sees version N.
 */
export async function saveFormVersion(session: StaffSession, editionId: string, definition: FormDefinition, publish: boolean) {
  const parsed = formDefinitionSchema.parse(definition);
  return withUserDb(session.claims, async (tx) => {
    const [latest] = await tx
      .select({ v: max(formDefinitions.version) })
      .from(formDefinitions)
      .where(eq(formDefinitions.editionId, editionId));
    const version = (latest?.v ?? 0) + 1;
    const [row] = await tx
      .insert(formDefinitions)
      .values({ editionId, version, definition: parsed, publishedAt: publish ? new Date() : null, createdBy: session.email })
      .returning();
    return row!;
  });
}
