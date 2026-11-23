import "server-only";
import type { StaffSession } from "@/server/auth/session";
import type { Edition } from "@/server/privileged/editions";
import { formatDate, formatDayRange } from "@/server/domain/editions";
import { renderImpactPdf } from "@/server/pdf/impact";
import { impactReport } from "./queries";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function impactCsv(session: StaffSession, edition: Edition): Promise<string> {
  const r = await impactReport(session, edition.id);
  const lines: unknown[][] = [["section", "label", "value"]];
  for (const [k, v] of Object.entries(r.totals)) lines.push(["totals", k, v]);
  for (const s of r.bySource) lines.push(["source", s.label, s.n]);
  for (const s of r.byState) lines.push(["state", s.label, s.n]);
  for (const a of r.attendanceByDay) lines.push(["attendance", `day ${a.day}`, a.n]);
  for (const f of r.feedback) lines.push(["feedback_avg", `day ${f.day}`, f.avg]);
  for (const p of r.partners) lines.push(["partner", p.type, p.name]);
  return lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
}

export async function impactPdf(session: StaffSession, edition: Edition): Promise<Buffer> {
  const r = await impactReport(session, edition.id);
  return renderImpactPdf({
    editionName: edition.name,
    dates: formatDayRange(edition),
    generatedOn: formatDate(new Date()),
    totals: r.totals,
    bySource: r.bySource.map((x) => ({ label: x.label, n: x.n })),
    byState: r.byState.map((x) => ({ label: x.label, n: x.n })),
    attendance: r.attendanceByDay.map((a) => ({ label: `Day ${a.day}`, n: a.n })),
    feedback: r.feedback.map((f) => ({ label: `Day ${f.day}`, avg: f.avg, n: f.n })),
    partners: r.partners,
  });
}
