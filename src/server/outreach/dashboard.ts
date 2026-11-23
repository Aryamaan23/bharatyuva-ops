import "server-only";
import { and, count, eq, inArray, lte } from "drizzle-orm";
import type { StaffSession } from "@/server/auth/session";
import { organisations, partnerships, sequenceSteps } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { todayIst } from "@/server/domain/sequences";

/** Partner status per day, today's queue size and pipeline totals for the dashboard. */
export async function outreachSnapshot(session: StaffSession, editionId: string) {
  return withUserDb(session.claims, async (tx) => {
    const confirmed = await tx
      .select({ id: partnerships.id, type: organisations.type, name: organisations.name })
      .from(partnerships)
      .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
      .where(and(eq(partnerships.editionId, editionId), eq(partnerships.stage, "confirmed")));
    const discussing = await tx
      .select({ type: organisations.type, n: count() })
      .from(partnerships)
      .innerJoin(organisations, eq(organisations.id, partnerships.organisationId))
      .where(and(eq(partnerships.editionId, editionId), eq(partnerships.stage, "in_discussion")))
      .groupBy(organisations.type);
    const [queueMine] = await tx
      .select({ n: count() })
      .from(sequenceSteps)
      .innerJoin(partnerships, eq(partnerships.id, sequenceSteps.partnershipId))
      .where(and(eq(partnerships.editionId, editionId), eq(partnerships.ownerEmail, session.email), eq(sequenceSteps.status, "pending"), lte(sequenceSteps.dueAt, todayIst()), inArray(sequenceSteps.step, ["first", "fu1", "fu2"])));
    const [queueAll] = await tx
      .select({ n: count() })
      .from(sequenceSteps)
      .innerJoin(partnerships, eq(partnerships.id, sequenceSteps.partnershipId))
      .where(and(eq(partnerships.editionId, editionId), eq(sequenceSteps.status, "pending"), lte(sequenceSteps.dueAt, todayIst()), inArray(sequenceSteps.step, ["first", "fu1", "fu2"])));
    const byStage = await tx
      .select({ stage: partnerships.stage, n: count() })
      .from(partnerships)
      .where(eq(partnerships.editionId, editionId))
      .groupBy(partnerships.stage);
    return { confirmed, discussing, queueMine: queueMine?.n ?? 0, queueAll: queueAll?.n ?? 0, byStage };
  });
}
