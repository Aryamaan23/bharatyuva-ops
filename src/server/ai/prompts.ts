import "server-only";
import { generateText, type AiResult } from "./client";

/** One-line personal reason for an outreach email, from what we know about the partner. */
export async function suggestPersonalLine(input: {
  partnershipId: string;
  actorEmail: string;
  partnerType: string;
  orgName: string;
  location: string | null;
  fitReason: string | null;
  suggestedApproach: string | null;
  notes: string | null;
  pastPartner: boolean;
  recentActivity: string[];
}): Promise<AiResult> {
  const facts = [
    `Partner type: ${input.partnerType}`,
    `Organisation: ${input.orgName}`,
    input.location && `Location: ${input.location}`,
    input.fitReason && `Why they fit: ${input.fitReason}`,
    input.suggestedApproach && `Suggested way in: ${input.suggestedApproach}`,
    input.notes && `Team notes: ${input.notes}`,
    input.pastPartner && "They partnered with an earlier edition of Bharat Yuva.",
    input.recentActivity.length > 0 && `Recent contact: ${input.recentActivity.join(" | ")}`,
  ]
    .filter(Boolean)
    .join("\n");
  return generateText({
    purpose: "outreach_personal_line",
    entity: "partnership",
    entityId: input.partnershipId,
    system:
      "You help a small Indian youth organisation write outreach to universities, district administrations and embassies. Write ONE sentence (under 35 words) that opens the email with a specific, genuine reason for writing to this organisation, using only the facts given. Formal, warm Indian English. No flattery, no exclamation marks, no invented facts, no greeting, no quotation marks. If the facts are thin, write a modest sentence about why their work is relevant to a public policy fellowship.",
    prompt: facts,
    maxTokens: 300,
    effort: "low",
    actorEmail: input.actorEmail,
  });
}

/** Neutral summary for reviewers. Explicitly no score and no recommendation. */
export async function summariseApplication(input: {
  applicationId: string;
  actorEmail: string | null;
  answers: { question: string; answer: string }[];
}): Promise<AiResult> {
  const body = input.answers.map((a) => `Q: ${a.question}\nA: ${a.answer || "(no answer)"}`).join("\n\n");
  return generateText({
    purpose: "application_summary",
    entity: "application",
    entityId: input.applicationId,
    system:
      "You summarise fellowship applications for human reviewers. Write 3-5 short bullet points covering what the applicant says about their motivation, the problem they chose and their proposed first step, and any relevant experience. Be neutral and factual; quote short phrases where useful. Do NOT score, rank, judge quality, recommend a decision, or guess at the applicant's identity, gender, caste, religion or background. Answers may be in Hindi or English; write the summary in English.",
    prompt: body,
    maxTokens: 800,
    effort: "low",
    actorEmail: input.actorEmail,
  });
}

/** Thank-you note draft for a partner after the event. */
export async function draftThankYouLine(input: { partnershipId: string; actorEmail: string; orgName: string; partnerType: string; notes: string | null }): Promise<AiResult> {
  return generateText({
    purpose: "thank_you_line",
    entity: "partnership",
    entityId: input.partnershipId,
    system:
      "Write ONE warm, specific sentence (under 35 words) thanking this partner for their role in the Bharat Yuva fellowship, using only the facts given. Formal Indian English, no exclamation marks, no invented details.",
    prompt: `Partner: ${input.orgName} (${input.partnerType})\nNotes: ${input.notes ?? "none"}`,
    maxTokens: 300,
    effort: "low",
    actorEmail: input.actorEmail,
  });
}
