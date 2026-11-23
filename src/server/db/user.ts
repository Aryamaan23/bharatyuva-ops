import "server-only";
import { sql } from "drizzle-orm";
import { rawDb, type Database } from "./client";

export type JwtClaims = {
  sub: string;
  email: string;
  role?: string;
  [key: string]: unknown;
};

/** Transaction handle with the same query API as the database. */
export type UserTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Run queries as the signed-in user with Postgres RLS enforced.
 *
 * Opens a transaction, sets `request.jwt.claims` (what auth.uid() and our app_private helpers
 * read) and switches to the `authenticated` role for the rest of the transaction. `SET LOCAL`
 * and `set_config(..., true)` are transaction-scoped, so this is safe with the transaction pooler.
 */
export async function withUserDb<T>(claims: JwtClaims, fn: (tx: UserTx) => Promise<T>): Promise<T> {
  const payload = JSON.stringify({ ...claims, role: "authenticated" });
  return rawDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${payload}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
