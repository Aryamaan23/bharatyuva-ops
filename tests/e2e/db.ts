import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

/** Direct database access for arranging e2e test data (local Supabase only). */
export const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 2, onnotice: () => {} });

export async function currentEditionId(): Promise<string> {
  const [row] = await sql<{ id: string }[]>`select id from app.editions where is_current limit 1`;
  if (!row) throw new Error("No current edition: run npm run db:seed");
  return row.id;
}

export const cronSecret = () => process.env.CRON_SECRET ?? "";
