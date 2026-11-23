import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __bySql?: postgres.Sql; __byDb?: Database };

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  return url;
}

/**
 * Raw connection (privileged role). Not exported from the package surface: use `adminDb`
 * (src/server/db/admin.ts) or `withUserDb` (src/server/db/user.ts).
 * `prepare: false` is required for Supabase's transaction pooler.
 */
export function rawDb(): Database {
  if (!globalForDb.__byDb) {
    globalForDb.__bySql = postgres(connectionString(), {
      prepare: false,
      max: process.env.NODE_ENV === "production" ? 3 : 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    globalForDb.__byDb = drizzle(globalForDb.__bySql, { schema, casing: "snake_case" });
  }
  return globalForDb.__byDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__bySql?.end({ timeout: 5 });
  globalForDb.__bySql = undefined;
  globalForDb.__byDb = undefined;
}

export { schema };
