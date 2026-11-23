import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import { ORG } from "@/content/organisation";

const NAVY = "#273661";
const GOLD = "#F2C744";

const s = StyleSheet.create({
  cover: { backgroundColor: NAVY, color: "#ffffff", padding: 60, justifyContent: "center" },
  kicker: { color: GOLD, fontSize: 12, letterSpacing: 2, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 36, fontFamily: "Helvetica-Bold", marginTop: 16 },
  subtitle: { fontSize: 14, marginTop: 10 },
  page: { padding: 56, fontSize: 11, fontFamily: "Helvetica", color: "#1b2440", lineHeight: 1.5 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", color: NAVY, marginBottom: 14 },
  intro: { marginBottom: 18 },
  row: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.5, borderBottomColor: "#d9dce8", paddingVertical: 6 },
  team: { fontFamily: "Helvetica-Bold" },
  abstract: { fontSize: 9.5, color: "#5a6380", marginTop: 2 },
  divider: { padding: 56, justifyContent: "center" },
  dividerTitle: { fontSize: 24, fontFamily: "Helvetica-Bold", color: NAVY },
});

export type CompendiumEntry = { teamName: string; title: string; abstract: string | null; members: string[]; pdf: Uint8Array | null };

/** Cover + contents + (divider + team PDF) for each entry, merged into one file. */
export async function renderCompendium(input: { editionName: string; dates: string | null; title: string; intro: string; entries: CompendiumEntry[] }): Promise<Buffer> {
  const front = await renderToBuffer(
    <Document title={input.title} author={ORG.name}>
      <Page size="A4" style={s.cover}>
        <Text style={s.kicker}>{ORG.name.toUpperCase()} · BHARAT YUVA</Text>
        <Text style={s.title}>{input.title}</Text>
        <Text style={s.subtitle}>
          {input.editionName}
          {input.dates ? ` · ${input.dates}` : ""}
        </Text>
      </Page>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Contents</Text>
        {input.intro && <Text style={s.intro}>{input.intro}</Text>}
        {input.entries.map((e, i) => (
          <View key={i} style={s.row} wrap={false}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.team}>
                {i + 1}. {e.title}
              </Text>
              <Text style={s.abstract}>
                {e.teamName}: {e.members.join(", ")}
              </Text>
              {e.abstract && <Text style={s.abstract}>{e.abstract.slice(0, 300)}</Text>}
            </View>
          </View>
        ))}
      </Page>
    </Document>,
  );

  const out = await PDFDocument.create();
  const add = async (bytes: Uint8Array) => {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  };
  await add(front);
  for (const [i, e] of input.entries.entries()) {
    const divider = await renderToBuffer(
      <Document>
        <Page size="A4" style={s.divider}>
          <Text style={s.kicker}>ENTRY {i + 1}</Text>
          <Text style={s.dividerTitle}>{e.title}</Text>
          <Text style={{ marginTop: 8 }}>{e.teamName}</Text>
          <Text style={{ marginTop: 4, fontSize: 10, color: "#5a6380" }}>{e.members.join(", ")}</Text>
        </Page>
      </Document>,
    );
    await add(divider);
    if (e.pdf) {
      try {
        await add(e.pdf);
      } catch {
        // A damaged or protected upload shouldn't break the whole compendium; the divider stays.
      }
    }
  }
  out.setTitle(input.title);
  out.setAuthor(ORG.name);
  return Buffer.from(await out.save());
}
