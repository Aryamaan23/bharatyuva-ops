/**
 * Outreach template merge fields: {{salutation}} {{org}} {{personal}} {{edition}} {{dates}}
 * {{poster}} {{signature}}. Unknown placeholders are reported so nothing half-merged is ever sent.
 */
export const MERGE_FIELDS = ["salutation", "org", "personal", "edition", "dates", "poster", "signature"] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export type MergeValues = Record<MergeField, string>;

export type MergeResult = { text: string; missing: string[]; unknown: string[] };

export function renderTemplate(template: string, values: Partial<MergeValues>): MergeResult {
  const missing = new Set<string>();
  const unknown = new Set<string>();
  const text = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key: string) => {
    if (!(MERGE_FIELDS as readonly string[]).includes(key)) {
      unknown.add(key);
      return match;
    }
    const v = values[key as MergeField];
    if (!v || !v.trim()) {
      missing.add(key);
      return match;
    }
    return v;
  });
  return { text, missing: [...missing], unknown: [...unknown] };
}

/** "Dear Dr. Sharma," / "Respected Sir/Madam," depending on what we know about the contact. */
export function salutationFor(contact: { name?: string | null; roleTitle?: string | null }, partnerType: string): string {
  const name = contact.name?.trim();
  const placeholderName = !name || /confirm|officers change|\(|tbc|n\/a/i.test(name);
  if (!placeholderName) {
    const first = name!.split(/[;,]/)[0]!.replace(/\s*\(.*$/, "").trim();
    return `Dear ${first},`;
  }
  if (partnerType === "district") return "Respected Sir/Madam,";
  if (contact.roleTitle) return `Dear ${contact.roleTitle.split(/[;,]/)[0]!.trim()},`;
  return "Dear Sir/Madam,";
}

export function defaultSignature(staff: { fullName: string; phone?: string | null }, orgEmail?: string | null): string {
  return [staff.fullName, staff.phone, "Beyond the Classroom", orgEmail].filter(Boolean).join("\n");
}
