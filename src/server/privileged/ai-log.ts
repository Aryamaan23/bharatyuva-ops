import "server-only";
import { adminDb } from "@/server/db/admin";
import { aiGenerations } from "@/server/db/schema";

/** Append an AI output to the audit table (staff can read it; nobody can edit it). */
export async function logAiGeneration(row: typeof aiGenerations.$inferInsert) {
  await adminDb().insert(aiGenerations).values(row);
}
