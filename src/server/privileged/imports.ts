import "server-only";
import { adminDb } from "@/server/db/admin";
import { imports } from "@/server/db/schema";

/** Import history is append-only for staff (read via RLS), written here. */
export async function recordImport(input: { fileName: string; summary: object; actorEmail: string }) {
  await adminDb().insert(imports).values({ fileName: input.fileName.slice(0, 200), summary: input.summary, actorEmail: input.actorEmail });
}
