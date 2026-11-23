import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { ORG } from "@/content/organisation";

const NAVY = "#273661";
const GOLD = "#F2C744";

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 56, fontSize: 11, fontFamily: "Helvetica", lineHeight: 1.5, color: "#1b2440" },
  head: { borderBottomWidth: 3, borderBottomColor: GOLD, paddingBottom: 10, marginBottom: 18, flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", color: NAVY },
  tagline: { fontSize: 9, color: "#5a6380" },
  addr: { fontSize: 8.5, color: "#5a6380", textAlign: "right" },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14, fontSize: 10 },
  to: { marginBottom: 14 },
  subject: { fontFamily: "Helvetica-Bold", marginBottom: 12 },
  para: { marginBottom: 9, textAlign: "justify" },
  sign: { marginTop: 18 },
  footer: { position: "absolute", bottom: 24, left: 56, right: 56, fontSize: 8, color: "#5a6380", textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#d9dce8", paddingTop: 6 },
});

export type LetterInput = {
  reference: string;
  date: string;
  toLines: string[];
  subject: string;
  salutation: string;
  paragraphs: string[];
  signatureLines: string[];
};

export function LetterDocument(l: LetterInput) {
  return (
    <Document title={l.subject} author={ORG.name}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>
            <Text style={s.brand}>{ORG.name}</Text>
            <Text style={s.tagline}>{ORG.tagline}</Text>
          </View>
          <View>
            {ORG.addressLines.map((a) => (
              <Text key={a} style={s.addr}>
                {a}
              </Text>
            ))}
            <Text style={s.addr}>{ORG.website}</Text>
          </View>
        </View>
        <View style={s.meta}>
          <Text>Ref: {l.reference}</Text>
          <Text>Date: {l.date}</Text>
        </View>
        <View style={s.to}>
          <Text>To,</Text>
          {l.toLines.map((t) => (
            <Text key={t}>{t}</Text>
          ))}
        </View>
        <Text style={s.subject}>Subject: {l.subject}</Text>
        <Text style={s.para}>{l.salutation}</Text>
        {l.paragraphs.map((p, i) => (
          <Text key={i} style={s.para}>
            {p}
          </Text>
        ))}
        <View style={s.sign}>
          <Text>Yours faithfully,</Text>
          {l.signatureLines.map((t) => (
            <Text key={t}>{t}</Text>
          ))}
        </View>
        <Text style={s.footer} fixed>
          {ORG.name} · {ORG.registration}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderLetterPdf(input: LetterInput): Promise<Buffer> {
  return renderToBuffer(<LetterDocument {...input} />);
}
