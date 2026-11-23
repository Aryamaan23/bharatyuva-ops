import "server-only";
import { formatDate } from "@/server/domain/editions";
import { defaultSignature } from "@/server/domain/merge";
import { renderLetterPdf } from "@/server/pdf/letter";
import { mergeValues, outreachContext } from "./outreach";

/** Formal request letter for a district office, on letterhead, with the same merge fields. */
export async function districtLetterPdf(partnershipId: string): Promise<{ pdf: Buffer; filename: string } | null> {
  const ctx = await outreachContext(partnershipId);
  if (!ctx) return null;
  const v = await mergeValues(ctx);
  const role = ctx.contact?.roleTitle?.split(/[;,]/)[0]?.trim() || (ctx.org.type === "district" ? "The District Collector / District Magistrate" : "The Head of Office");
  const reference = `BTC/BY/${ctx.edition.slug.toUpperCase()}/${ctx.p.id.slice(0, 6).toUpperCase()}`;
  const pdf = await renderLetterPdf({
    reference,
    date: formatDate(new Date()),
    toLines: [role, ctx.org.name, ctx.org.location ?? ""].filter(Boolean),
    subject: `Request for a one-day field immersion for ${v.edition} fellows${v.dates ? ` on ${v.dates}` : ""}`,
    salutation: ctx.org.type === "district" ? "Respected Sir/Madam," : (v.salutation ?? "Dear Sir/Madam,"),
    paragraphs: [
      `Beyond the Classroom is a youth organisation that runs ${v.edition}, a three-day public policy fellowship for young people from across India. The first edition received more than 200 applications from over 12 states.`,
      ...(v.personal ? [v.personal] : []),
      `We respectfully seek the support of your office in hosting Day 2 of the fellowship, a one-day field immersion in ${ctx.org.name}${v.dates ? ` on ${v.dates}` : ""}. A group of about 40–60 fellows, accompanied by our team, would interact with district officers, visit two or three sites where public schemes are delivered, and afterwards share their observations and recommendations with your office.`,
      "We would be grateful if your office could nominate a nodal officer to coordinate with us. We will arrange transport and logistics, and will follow every procedure and permission your office advises.",
      "We would be honoured by your support and are available to meet at your convenience.",
    ],
    signatureLines: (ctx.owner ? (ctx.owner.signature ?? defaultSignature(ctx.owner, ctx.edition.contactEmail)) : "Beyond the Classroom").split("\n"),
  });
  return { pdf, filename: `Bharat-Yuva-request-${ctx.org.name.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40)}.pdf` };
}
