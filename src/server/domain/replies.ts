export type ReplyKind = "reply" | "optout" | "bounce" | "auto_reply";

export type InboundMessage = { from: string; subject: string; body: string; headers?: Record<string, string> };

const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery (subsystem|system)/i;
const BOUNCE_SUBJECT = /(undeliverable|delivery status notification|returned mail|delivery (has )?failed|failure notice|address not found)/i;
const AUTO_SUBJECT = /(out of office|automatic reply|auto[- ]?reply|autoreply|away from (the )?office)/i;
// "no", "no thanks", "not interested", "unsubscribe", "remove me", Hindi "nahi"/"नहीं".
const OPTOUT_FIRST_LINE =
  /^\s*(no\b[\s.,!]*(thanks?|thank you)?[\s.,!]*$|not interested\b|unsubscribe\b|please remove\b|remove me\b|do not (contact|email)\b|stop\b|nahi\b|नहीं)/i;

/** The new text of a reply, without the quoted thread below it. */
export function stripQuoted(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^On .+wrote:\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    if (/^From:\s/i.test(line.trim()) && out.length > 0) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

/** Classify a message that arrived on one of our outreach threads. */
export function classifyReply(msg: InboundMessage): ReplyKind {
  if (BOUNCE_FROM.test(msg.from) || BOUNCE_SUBJECT.test(msg.subject)) return "bounce";
  const autoHeader = msg.headers?.["auto-submitted"];
  if ((autoHeader && autoHeader.toLowerCase() !== "no") || AUTO_SUBJECT.test(msg.subject)) return "auto_reply";
  const firstLine = stripQuoted(msg.body).split("\n").find((l) => l.trim()) ?? "";
  if (OPTOUT_FIRST_LINE.test(firstLine)) return "optout";
  return "reply";
}
