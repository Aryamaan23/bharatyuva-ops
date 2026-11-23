import postgres from "postgres";

/** Reset rate-limit counters so repeated local runs from 127.0.0.1 aren't throttled. */
export default async function globalSetup() {
  const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 1, onnotice: () => {} });
  await sql`delete from app.rate_limits`;
  await sql.end();
}
