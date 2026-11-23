"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formDefinitionSchema, localizedText } from "@/lib/forms/definition";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { editions, editionStatus } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import { audit } from "@/server/privileged/audit";
import { saveFormVersion, setCurrentEdition } from "./admin";

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .or(z.literal(""))
  .transform((v) => v || null);
/** datetime-local input values are interpreted as IST. */
const optionalIstDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .or(z.literal(""))
  .transform((v) => (v ? new Date(`${v}:00+05:30`) : null));
const text = (maxLen: number) => z.string().trim().max(maxLen);

const editionSchema = z.object({
  name: text(120).min(3),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/, "Use lowercase letters, digits and hyphens"),
  status: z.enum(editionStatus.enumValues),
  day1Date: optionalDate,
  day2Date: optionalDate,
  day3Date: optionalDate,
  applicationsOpenAt: optionalIstDateTime,
  applicationsCloseAt: optionalIstDateTime,
  seatConfirmHours: z.coerce.number().int().min(12).max(336),
  retentionMonths: z.coerce.number().int().min(1).max(60),
  minAge: z.coerce.number().int().min(13).max(30),
  contactEmail: z.email().or(z.literal("")).transform((v) => v || null),
  day1Venue: text(200),
  day1City: text(100),
  day2Venue: text(200),
  day2City: text(100),
  day3Venue: text(200),
  day3City: text(100),
  posterUniversity: z.url().or(z.literal("")),
  posterDistrict: z.url().or(z.literal("")),
  posterEmbassy: z.url().or(z.literal("")),
  posterGeneral: z.url().or(z.literal("")),
  postSelectionDocuments: z.string().max(5000),
});

export type EditionFormState = { ok?: boolean; errors?: Record<string, string> };

/** Lines like "id_proof | Government photo ID | आधिकारिक फ़ोटो पहचान पत्र | required". */
function parseDocuments(raw: string) {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [key = "", en = "", hi = "", req = ""] = line.split("|").map((p) => p.trim());
      return { key, label: localizedText.parse({ en: en || key, hi }), required: /^req/i.test(req) };
    })
    .filter((d) => /^[a-z][a-z0-9_]{1,40}$/.test(d.key));
}

export async function saveEdition(_prev: EditionFormState, formData: FormData): Promise<EditionFormState> {
  const session = await requireStaff(ADMIN_ROLES);
  const id = formData.get("id")?.toString() || null;
  const parsed = editionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const d = parsed.data;
  if (d.applicationsOpenAt && d.applicationsCloseAt && d.applicationsCloseAt <= d.applicationsOpenAt) {
    return { errors: { applicationsCloseAt: "Close must be after open" } };
  }
  const venue = (name: string, city: string) => (name ? { name, city } : undefined);
  const values = {
    name: d.name,
    slug: d.slug,
    status: d.status,
    day1Date: d.day1Date,
    day2Date: d.day2Date,
    day3Date: d.day3Date,
    applicationsOpenAt: d.applicationsOpenAt,
    applicationsCloseAt: d.applicationsCloseAt,
    seatConfirmHours: d.seatConfirmHours,
    retentionMonths: d.retentionMonths,
    minAge: d.minAge,
    contactEmail: d.contactEmail,
    venues: { day1: venue(d.day1Venue, d.day1City), day2: venue(d.day2Venue, d.day2City), day3: venue(d.day3Venue, d.day3City) },
    posterUrls: {
      university: d.posterUniversity || undefined,
      district: d.posterDistrict || undefined,
      embassy: d.posterEmbassy || undefined,
      general: d.posterGeneral || undefined,
    },
    postSelectionDocuments: parseDocuments(d.postSelectionDocuments),
  };

  let savedId = id;
  try {
    await withUserDb(session.claims, async (tx) => {
      if (id) {
        await tx.update(editions).set(values).where(eq(editions.id, id));
      } else {
        const [row] = await tx.insert(editions).values(values).returning({ id: editions.id });
        savedId = row!.id;
      }
    });
  } catch (err) {
    if (err instanceof Error && /editions_slug_unique|duplicate key/.test(err.message)) {
      return { errors: { slug: "Another edition already uses this slug" } };
    }
    throw err;
  }
  await audit({ actorEmail: session.email, action: id ? "edition.updated" : "edition.created", entity: "edition", entityId: savedId, after: values });
  revalidatePath("/admin/editions");
  revalidatePath("/[locale]", "page");
  if (!id) redirect(`/admin/editions/${savedId}` as never);
  return { ok: true };
}

export async function makeEditionCurrent(formData: FormData): Promise<void> {
  const session = await requireStaff(ADMIN_ROLES);
  const id = z.uuid().parse(formData.get("id"));
  await setCurrentEdition(session, id);
  await audit({ actorEmail: session.email, action: "edition.made_current", entity: "edition", entityId: id });
  revalidatePath("/admin/editions");
  revalidatePath("/[locale]", "page");
}

export type SaveFormResult = { ok: true; version: number; published: boolean } | { ok: false; errors: string[] };

export async function saveFormAction(editionId: string, definition: unknown, publish: boolean): Promise<SaveFormResult> {
  const session = await requireStaff(ADMIN_ROLES);
  if (!z.uuid().safeParse(editionId).success) return { ok: false, errors: ["Invalid edition"] };
  const parsed = formDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`) };
  }
  const row = await saveFormVersion(session, editionId, parsed.data, publish);
  await audit({
    actorEmail: session.email,
    action: publish ? "form.published" : "form.saved",
    entity: "edition",
    entityId: editionId,
    after: { version: row.version },
  });
  revalidatePath(`/admin/editions/${editionId}/form`);
  return { ok: true, version: row.version, published: publish };
}
