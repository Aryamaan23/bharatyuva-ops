import "server-only";
import { rawDb, type Database } from "./client";

/**
 * Privileged database access that BYPASSES Row Level Security.
 *
 * Only importable from src/server/jobs, src/server/messaging, src/server/privileged and scripts
 * (enforced by ESLint). Code using it must do its own authorisation and should write to the
 * audit log for anything a person would want traced.
 */
export function adminDb(): Database {
  return rawDb();
}
