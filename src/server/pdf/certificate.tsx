import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { ORG } from "@/content/organisation";

const NAVY = "#273661";
const GOLD = "#F2C744";

const s = StyleSheet.create({
  page: { padding: 28, fontFamily: "Helvetica", color: "#1b2440" },
  frame: { flex: 1, borderWidth: 6, borderColor: NAVY, padding: 6 },
  inner: { flex: 1, borderWidth: 1.5, borderColor: GOLD, paddingVertical: 40, paddingHorizontal: 60, alignItems: "center" },
  org: { fontSize: 12, letterSpacing: 2, color: NAVY, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 34, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 26 },
  sub: { fontSize: 13, marginTop: 6, color: "#5a6380" },
  presented: { fontSize: 12, marginTop: 30, color: "#5a6380" },
  name: { fontSize: 30, fontFamily: "Helvetica-Bold", marginTop: 8, borderBottomWidth: 1, borderBottomColor: GOLD, paddingBottom: 6, paddingHorizontal: 30 },
  college: { fontSize: 12, marginTop: 6, color: "#5a6380" },
  body: { fontSize: 13, marginTop: 20, textAlign: "center", lineHeight: 1.5, maxWidth: 520 },
  footer: { position: "absolute", bottom: 34, left: 60, right: 60, flexDirection: "row", justifyContent: "space-between", fontSize: 9, color: "#5a6380" },
  sign: { alignItems: "center" },
  signLine: { width: 160, borderTopWidth: 1, borderTopColor: "#1b2440", marginBottom: 4 },
});

export type CertificateInput = {
  kind: "participation" | "winner" | "ambassador";
  recipientName: string;
  college: string | null;
  editionName: string;
  dates: string | null;
  detail: string | null;
  code: string;
  verifyUrl: string;
  issuedOn: string;
};

const TITLES = {
  participation: { title: "Certificate of Participation", body: (e: string, d: string | null) => `for completing ${e}${d ? ` (${d})` : ""}, a three-day public policy fellowship: learning from practitioners, a field immersion with a district administration, and presenting policy recommendations.` },
  winner: { title: "Certificate of Excellence", body: (e: string) => `awarded to a member of the winning team at ${e}, in recognition of outstanding policy recommendations presented on the final day.` },
  ambassador: { title: "Campus Ambassador Certificate", body: (e: string) => `in recognition of outstanding work as a campus ambassador for ${e}, bringing the fellowship to students across their institution.` },
};

export async function renderCertificatePdf(c: CertificateInput): Promise<Buffer> {
  const t = TITLES[c.kind];
  return renderToBuffer(
    <Document title={`${t.title}: ${c.recipientName}`} author={ORG.name}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.frame}>
          <View style={s.inner}>
            <Text style={s.org}>{ORG.name.toUpperCase()} · BHARAT YUVA</Text>
            <Text style={s.title}>{t.title}</Text>
            <Text style={s.sub}>{c.editionName}</Text>
            <Text style={s.presented}>This is presented to</Text>
            <Text style={s.name}>{c.recipientName}</Text>
            {c.college && <Text style={s.college}>{c.college}</Text>}
            <Text style={s.body}>{t.body(c.editionName, c.dates)}</Text>
            {c.detail && <Text style={[s.body, { marginTop: 8, fontSize: 11 }]}>{c.detail}</Text>}
            <View style={s.footer}>
              <View>
                <Text>Issued {c.issuedOn}</Text>
                <Text>Verify: {c.verifyUrl}</Text>
                <Text>Code: {c.code}</Text>
              </View>
              <View style={s.sign}>
                <View style={s.signLine} />
                <Text>For {ORG.name}</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>,
  );
}
