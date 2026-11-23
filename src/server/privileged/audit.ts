import "server-only";
import { adminDb } from "@/server/db/admin";
import { auditLog } from "@/server/db/schema";

export type AuditEntry = {
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipHash?: string | null;
};

/**
 * Append to the audit log. Called for every send, status change, export, role change and
 * deletion. The table rejects UPDATE/DELETE at the database level.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  await adminDb()
    .insert(auditLog)
    .values({
      actorEmail: entry.actorEmail,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ipHash: entry.ipHash ?? null,
    });
}
