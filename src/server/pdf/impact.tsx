import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { ORG } from "@/content/organisation";

const NAVY = "#273661";
const GOLD = "#F2C744";

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 10.5, fontFamily: "Helvetica", color: "#1b2440", lineHeight: 1.4 },
  kicker: { color: NAVY, fontSize: 9, letterSpacing: 1.5, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 4 },
  sub: { color: "#5a6380", marginBottom: 18 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 18 },
  stat: { width: "31%", borderTopWidth: 3, borderTopColor: GOLD, paddingTop: 6, paddingBottom: 8 },
  statValue: { fontSize: 20, fontFamily: "Helvetica-Bold", color: NAVY },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 14, marginBottom: 6 },
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  barLabel: { width: 150 },
  bar: { height: 8, backgroundColor: NAVY },
  barValue: { marginLeft: 6, width: 30 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: "#5a6380", textAlign: "center" },
});

type Row = { label: string; n: number };

function Bars({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <View>
      {rows.map((r) => (
        <View key={r.label} style={s.barRow} wrap={false}>
          <Text style={s.barLabel}>{r.label}</Text>
          <View style={[s.bar, { width: `${(r.n / max) * 50}%` }]} />
          <Text style={s.barValue}>{r.n}</Text>
        </View>
      ))}
    </View>
  );
}

export type ImpactPdfInput = {
  editionName: string;
  dates: string | null;
  generatedOn: string;
  totals: { started: number; submitted: number; states: number; selected: number; confirmed: number; attended: number };
  bySource: Row[];
  byState: Row[];
  attendance: Row[];
  feedback: { label: string; avg: number | null; n: number }[];
  partners: { name: string; type: string }[];
};

export async function renderImpactPdf(r: ImpactPdfInput): Promise<Buffer> {
  const stat = (label: string, value: number | string) => (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text>{label}</Text>
    </View>
  );
  return renderToBuffer(
    <Document title={`${r.editionName} impact report`} author={ORG.name}>
      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>{ORG.name.toUpperCase()} · IMPACT REPORT</Text>
        <Text style={s.title}>{r.editionName}</Text>
        <Text style={s.sub}>
          {r.dates ?? ""} · generated {r.generatedOn}
        </Text>
        <View style={s.stats}>
          {stat("applications submitted", r.totals.submitted)}
          {stat("states represented", r.totals.states)}
          {stat("applications started", r.totals.started)}
          {stat("seats offered", r.totals.selected)}
          {stat("fellows confirmed", r.totals.confirmed)}
          {stat("fellows attended", r.totals.attended)}
        </View>
        <Text style={s.h2}>Where applicants came from</Text>
        <Bars rows={r.bySource.slice(0, 10)} />
        <Text style={s.h2}>Applications by state</Text>
        <Bars rows={r.byState.slice(0, 15)} />
        <Text style={s.h2}>Attendance</Text>
        <Bars rows={r.attendance} />
        <Text style={s.h2}>Feedback</Text>
        {r.feedback.length === 0 ? <Text>No feedback yet.</Text> : r.feedback.map((f) => <Text key={f.label}>{f.label}: {f.avg ?? "—"} / 5 ({f.n} responses)</Text>)}
        <Text style={s.h2}>Partners</Text>
        {r.partners.length === 0 ? <Text>None confirmed.</Text> : r.partners.map((p) => <Text key={p.name}>{p.name} ({p.type})</Text>)}
        <Text style={s.footer} fixed>
          {ORG.name} · Bharat Yuva
        </Text>
      </Page>
    </Document>,
  );
}
