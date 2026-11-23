import type { PartnerStage, PartnerType, Temperature } from "@/server/db/schema";

/**
 * Parsing rules for the partner outreach spreadsheet (one sheet per partner type, header row with
 * "Organisation" and "Email", data below). Pure functions so they can be tested without Excel.
 */

export const IMPORT_FIELDS = [
  "organisation",
  "role",
  "contactName",
  "email",
  "phone",
  "otherChannel",
  "location",
  "fit",
  "approach",
  "temperature",
  "status",
  "notes",
  "source",
  "verification",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = Partial<Record<ImportField, number>>;

const HEADER_HINTS: Record<ImportField, RegExp> = {
  organisation: /^organi[sz]ation|^institution|^name$/i,
  role: /who to address|office|role/i,
  contactName: /named contact|contact name|^contact$/i,
  email: /^e-?mail/i,
  phone: /^phone|mobile|telephone/i,
  otherChannel: /other channel|website|contact form/i,
  location: /^location|city|state/i,
  fit: /why target|fit/i,
  approach: /suggested way|approach|way in/i,
  temperature: /temperature|priority/i,
  status: /^status/i,
  notes: /^notes?/i,
  source: /^source/i,
  verification: /verification|verified/i,
};

export function sheetPartnerType(sheetName: string): PartnerType | null {
  if (/universit|college|day 1|learn/i.test(sheetName)) return "university";
  if (/district|collector|day 2|immerse/i.test(sheetName)) return "district";
  if (/embass|high commission|consulate|day 3|present/i.test(sheetName)) return "embassy";
  return null;
}

/** First row (within the first 10) that looks like a header: contains Organisation and Email. */
export function detectHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i]!.map((c) => c.trim());
    if (cells.some((c) => HEADER_HINTS.organisation.test(c)) && cells.some((c) => HEADER_HINTS.email.test(c))) return i;
  }
  return -1;
}

export function autoMapColumns(header: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  header.forEach((raw, idx) => {
    const cell = raw.trim();
    if (!cell || cell === "#") return;
    for (const field of IMPORT_FIELDS) {
      if (mapping[field] === undefined && HEADER_HINTS[field].test(cell)) {
        mapping[field] = idx;
        break;
      }
    }
  });
  return mapping;
}

export type ParsedContact = { name: string | null; roleTitle: string | null; email: string | null; phone: string | null };

export type ParsedPartner = {
  type: PartnerType;
  name: string;
  importKey: string;
  location: string | null;
  website: string | null;
  fitReason: string | null;
  suggestedApproach: string | null;
  sourceUrl: string | null;
  verificationNote: string | null;
  needsVerification: boolean;
  temperature: Temperature;
  stage: PartnerStage;
  notes: string | null;
  contacts: ParsedContact[];
  /** No email: needs a manual task (contact form or phone). */
  manualChannel: "form" | "phone" | null;
  warnings: string[];
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function importKey(type: PartnerType, name: string): string {
  return `${type}:${name.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, " ").trim()}`;
}

/** True when the source note says details must be confirmed before anyone writes to this contact. */
export function needsVerificationCheck(verification: string | null, contactName: string | null): boolean {
  return (
    /confirm|unclear|garbled|misaligned|secondary source/i.test(verification ?? "") || /confirm/i.test(contactName ?? "")
  );
}

function parseTemperature(v: string | null): Temperature {
  const t = (v ?? "").toLowerCase();
  return t.startsWith("hot") ? "hot" : t.startsWith("warm") ? "warm" : "cold";
}

function parseStage(v: string | null): PartnerStage {
  const s = (v ?? "").toLowerCase();
  if (!s || /not contacted|not started|to do/.test(s)) return "not_contacted";
  if (/confirm/.test(s)) return "confirmed";
  if (/declin|rejected/.test(s)) return "declined";
  if (/discussion|talks|replied/.test(s)) return "in_discussion";
  if (/follow.?up ?2/.test(s)) return "follow_up_2";
  if (/follow.?up/.test(s)) return "follow_up_1";
  if (/sent|contacted/.test(s)) return "email_sent";
  if (/do not|dnc/.test(s)) return "do_not_contact";
  return "not_contacted";
}

/** Split "A (Director); B (CEO)" and "a@x; b@y" into separate contacts, pairing by position. */
export function splitContacts(names: string | null, roles: string | null, emailsCell: string | null, phone: string | null): ParsedContact[] {
  const emails = [...new Set((emailsCell ?? "").match(EMAIL_RE)?.map((e) => e.toLowerCase()) ?? [])];
  const nameParts = (names ?? "").split(/;|\n/).map((s) => s.trim()).filter(Boolean);
  const roleParts = (roles ?? "").split(/;|\n/).map((s) => s.trim()).filter(Boolean);
  const count = Math.max(emails.length, 1);
  const contacts: ParsedContact[] = [];
  for (let i = 0; i < count; i++) {
    const rawName = nameParts[i] ?? (count === 1 ? nameParts.join("; ") : null) ?? null;
    const roleFromName = rawName?.match(/\(([^)]+)\)/)?.[1] ?? null;
    contacts.push({
      name: rawName ? rawName.replace(/\s*\([^)]*\)\s*/g, " ").trim() || null : null,
      roleTitle: roleFromName ?? roleParts[i] ?? roleParts[0] ?? null,
      email: emails[i] ?? null,
      phone: i === 0 ? phone : null,
    });
  }
  return contacts;
}

export function parsePartnerRow(type: PartnerType, row: string[], map: ColumnMapping): ParsedPartner | null {
  const get = (f: ImportField) => (map[f] === undefined ? null : clean(row[map[f]!]));
  const name = get("organisation");
  if (!name) return null;
  const warnings: string[] = [];
  const verification = get("verification");
  const contactName = get("contactName");
  const contacts = splitContacts(contactName, get("role"), get("email"), get("phone"));
  const other = get("otherChannel");
  const hasEmail = contacts.some((c) => c.email);
  let manualChannel: ParsedPartner["manualChannel"] = null;
  if (!hasEmail) {
    const formHint = /form/i.test(`${other ?? ""} ${verification ?? ""}`);
    manualChannel = formHint ? "form" : get("phone") ? "phone" : other ? "form" : null;
    warnings.push(manualChannel ? `No email: ${manualChannel === "form" ? "contact form" : "phone"} only` : "No contact channel");
  }
  const website = other?.match(/https?:\/\/\S+/)?.[0] ?? null;
  return {
    type,
    name,
    importKey: importKey(type, name),
    location: get("location"),
    website,
    fitReason: get("fit"),
    suggestedApproach: get("approach"),
    sourceUrl: get("source"),
    verificationNote: verification,
    needsVerification: needsVerificationCheck(verification, contactName),
    temperature: parseTemperature(get("temperature")),
    stage: parseStage(get("status")),
    notes: [get("notes"), other && !website ? `Other channel: ${other}` : null].filter(Boolean).join("\n") || null,
    contacts,
    manualChannel,
    warnings,
  };
}
