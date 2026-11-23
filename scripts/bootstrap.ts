/**
 * Load starting content (consent texts, outreach templates, default timeline) into any
 * environment, production included. Safe to re-run.
 *   MIGRATION_DATABASE_URL=... npx tsx scripts/bootstrap.ts
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/server/db/schema";
import { bootstrapContent } from "../src/server/bootstrap";

const client = postgres(process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? "", { prepare: false, max: 1, onnotice: () => {} });
bootstrapContent(drizzle(client, { schema, casing: "snake_case" }))
  .then(() => console.log("Bootstrap content loaded."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
