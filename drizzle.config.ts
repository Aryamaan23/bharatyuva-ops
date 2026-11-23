import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Migrations use a direct/session connection (MIGRATION_DATABASE_URL); the app uses the
// transaction pooler (DATABASE_URL). Locally both point at the Supabase Docker database.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  schemaFilter: ["app"],
  entities: { roles: { provider: "supabase" } },
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
  migrations: { schema: "drizzle", table: "__migrations" },
  strict: true,
  verbose: true,
});
