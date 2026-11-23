import "server-only";
import ExcelJS from "exceljs";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { StaffSession } from "@/server/auth/session";
import { contacts, organisations, partnerships, tasks } from "@/server/db/schema";
import type { PartnerType } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";
import {
  autoMapColumns,
  detectHeaderRow,
  IMPORT_FIELDS,
  parsePartnerRow,
  sheetPartnerType,
  type ColumnMapping,
  type ParsedPartner,
} from "@/server/domain/import";
import { todayIst } from "@/server/domain/sequences";
import { audit } from "@/server/privileged/audit";
import { recordImport } from "@/server/privileged/imports";

export type SheetPreview = {
  sheet: string;
  type: PartnerType | null;
  headerRow: number;
  header: string[];
  mapping: ColumnMapping;
  partners: ParsedPartner[];
  existing: number;
  needsVerification: number;
  manual: number;
};

const MAX_ROWS = 2000;

/** Read every sheet as rows of display text (hyperlinks and rich text flattened). */
export async function readWorkbook(buffer: ArrayBuffer): Promise<{ name: string; rows: string[][] }[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n > MAX_ROWS) return;
      const cells: string[] = [];
      for (let c = 1; c <= Math.min(ws.columnCount, 40); c++) cells.push((row.getCell(c).text ?? "").toString());
      rows.push(cells);
    });
    return { name: ws.name, rows };
  });
}

const PAST_PARTNER = /bharat yuva 1\.0|existing partner|existing relationship|hosted the bharat yuva/i;

export async function previewImport(session: StaffSession, buffer: ArrayBuffer, overrides: Record<string, ColumnMapping> = {}): Promise<SheetPreview[]> {
  const sheets = await readWorkbook(buffer);
  const previews: SheetPreview[] = [];
  for (const s of sheets) {
    const type = sheetPartnerType(s.name);
    const headerRow = detectHeaderRow(s.rows);
    if (headerRow < 0) {
      previews.push({ sheet: s.name, type, headerRow, header: [], mapping: {}, partners: [], existing: 0, needsVerification: 0, manual: 0 });
      continue;
    }
    const header = s.rows[headerRow]!;
    const mapping = overrides[s.name] ?? autoMapColumns(header);
    const partners = type
      ? s.rows
          .slice(headerRow + 1)
          .map((r) => parsePartnerRow(type, r, mapping))
          .filter((p): p is ParsedPartner => p !== null)
      : [];
    const keys = partners.map((p) => p.importKey);
    const existing = keys.length
      ? await withUserDb(session.claims, (tx) => tx.select({ k: organisations.importKey }).from(organisations).where(inArray(organisations.importKey, keys)))
      : [];
    previews.push({
      sheet: s.name,
      type,
      headerRow,
      header,
      mapping,
      partners,
      existing: existing.length,
      needsVerification: partners.filter((p) => p.needsVerification).length,
      manual: partners.filter((p) => p.manualChannel).length,
    });
  }
  return previews;
}

export type ImportSummary = { created: number; updated: number; contactsAdded: number; manualTasks: number; sheets: string[] };

/** Upsert organisations, contacts and this edition's partnerships. Safe to run repeatedly. */
export async function commitImport(
  session: StaffSession,
  input: { fileName: string; buffer: ArrayBuffer; overrides: Record<string, ColumnMapping>; editionId: string },
): Promise<ImportSummary> {
  const previews = await previewImport(session, input.buffer, input.overrides);
  const summary: ImportSummary = { created: 0, updated: 0, contactsAdded: 0, manualTasks: 0, sheets: [] };

  await withUserDb(session.claims, async (tx) => {
    for (const sheet of previews) {
      if (!sheet.type || sheet.partners.length === 0) continue;
      summary.sheets.push(sheet.sheet);
      for (const p of sheet.partners) {
        const values = {
          type: p.type,
          name: p.name,
          importKey: p.importKey,
          location: p.location,
          website: p.website,
          fitReason: p.fitReason,
          suggestedApproach: p.suggestedApproach,
          sourceUrl: p.sourceUrl,
          verificationNote: p.verificationNote,
          needsVerification: p.needsVerification,
          notes: p.notes,
        };
        const [existing] = await tx.select({ id: organisations.id }).from(organisations).where(eq(organisations.importKey, p.importKey)).limit(1);
        let orgId: string;
        if (existing) {
          await tx.update(organisations).set(values).where(eq(organisations.id, existing.id));
          orgId = existing.id;
          summary.updated += 1;
        } else {
          const [row] = await tx.insert(organisations).values(values).returning({ id: organisations.id });
          orgId = row!.id;
          summary.created += 1;
        }

        const current = await tx.select().from(contacts).where(eq(contacts.organisationId, orgId));
        for (const [i, c] of p.contacts.entries()) {
          const dup = current.find((x) => (c.email && x.email === c.email) || (!c.email && c.phone && x.phone === c.phone) || (!c.email && !c.phone && !x.email && x.name === c.name));
          if (dup) continue;
          if (!c.email && !c.phone && !c.name && !c.roleTitle) continue;
          await tx.insert(contacts).values({
            organisationId: orgId,
            name: c.name,
            roleTitle: c.roleTitle,
            email: c.email,
            phone: c.phone,
            channel: c.email ? "email" : (p.manualChannel ?? "email"),
            isPrimary: i === 0 && current.length === 0,
          });
          summary.contactsAdded += 1;
        }

        const [partnership] = await tx
          .insert(partnerships)
          .values({
            editionId: input.editionId,
            organisationId: orgId,
            stage: p.stage,
            temperature: p.temperature,
            pastPartner: PAST_PARTNER.test(`${p.fitReason ?? ""} ${p.suggestedApproach ?? ""}`),
          })
          .onConflictDoNothing()
          .returning({ id: partnerships.id });

        if (p.manualChannel && partnership) {
          const created = await tx
            .insert(tasks)
            .values({
              editionId: input.editionId,
              title: `${p.manualChannel === "form" ? "Submit the contact form" : "Phone"}: ${p.name}`,
              kind: "manual_contact",
              partnershipId: partnership.id,
              dueAt: todayIst(),
              sourceKey: `manual:${partnership.id}`,
              checklist:
                p.manualChannel === "form"
                  ? [
                      { label: `Open the contact form${p.website ? ` (${p.website})` : ""}`, done: false },
                      { label: "Paste the first email, with the personal line", done: false },
                      { label: "Include the poster link", done: false },
                      { label: "Log the submission on the partner page", done: false },
                    ]
                  : [
                      { label: "Call the office and ask for the right person", done: false },
                      { label: "Get an email address and add it as a contact", done: false },
                      { label: "Log the call on the partner page", done: false },
                    ],
            })
            .onConflictDoNothing()
            .returning({ id: tasks.id });
          summary.manualTasks += created.length;
        }
      }
    }
    // Mark organisations confirmed in an earlier edition as past partners in this one.
    const pastConfirmed = await tx
      .select({ orgId: partnerships.organisationId })
      .from(partnerships)
      .where(and(eq(partnerships.stage, "confirmed"), ne(partnerships.editionId, input.editionId)));
    const pastIds = [...new Set(pastConfirmed.map((r) => r.orgId))];
    if (pastIds.length) {
      await tx
        .update(partnerships)
        .set({ pastPartner: true })
        .where(and(eq(partnerships.editionId, input.editionId), inArray(partnerships.organisationId, pastIds)));
    }
  });

  await recordImport({ fileName: input.fileName, summary, actorEmail: session.email });
  await audit({ actorEmail: session.email, action: "partners.imported", entity: "edition", entityId: input.editionId, after: summary });
  return summary;
}

export { IMPORT_FIELDS };
export type { ColumnMapping };
