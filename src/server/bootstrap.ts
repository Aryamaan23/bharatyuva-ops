import { sql } from "drizzle-orm";
import { GUARDIAN_CONSENT, PROCESSING_CONSENT, WHATSAPP_CONSENT } from "@/content/privacy";
import { OUTREACH_TEMPLATES } from "@/content/outreach-templates";
import { DEFAULT_TIMELINE } from "@/content/timeline";
import type { Database } from "@/server/db/client";
import { consentVersions, emailTemplates, taskTemplates } from "@/server/db/schema";

/**
 * Non-fake starting content every environment needs (production included): consent texts v1,
 * the 12 outreach templates and the default timeline. Idempotent: existing rows are left alone.
 */
export async function bootstrapContent(db: Database) {
  await db
    .insert(consentVersions)
    .values([
      { kind: "processing", version: 1, textEn: PROCESSING_CONSENT.en, textHi: PROCESSING_CONSENT.hi },
      { kind: "whatsapp", version: 1, textEn: WHATSAPP_CONSENT.en, textHi: WHATSAPP_CONSENT.hi },
      { kind: "guardian", version: 1, textEn: GUARDIAN_CONSENT.en, textHi: GUARDIAN_CONSENT.hi },
    ])
    .onConflictDoNothing();
  for (const t of OUTREACH_TEMPLATES) {
    await db.insert(emailTemplates).values({ ...t, updatedBy: "bootstrap" }).onConflictDoNothing();
  }
  const [existing] = await db.select({ n: sql<number>`count(*)::int` }).from(taskTemplates);
  if (!existing?.n) {
    await db.insert(taskTemplates).values({ name: "Bharat Yuva standard timeline", tasks: DEFAULT_TIMELINE, isDefault: true, createdBy: "bootstrap" });
  }
}
