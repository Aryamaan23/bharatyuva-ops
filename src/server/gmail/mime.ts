import { randomUUID } from "node:crypto";

export type MimeAttachment = { filename: string; contentType: string; content: Buffer };

export type MimeMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
  messageIdDomain: string;
  attachments?: MimeAttachment[];
};

/** RFC 2047 encode a header value when it contains non-ASCII (Hindi names, curly quotes). */
export function encodeHeader(value: string): string {
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, (m) => `${m}\r\n`).trimEnd();

/** Build a plain-text RFC 5322 message (optionally multipart with attachments). */
export function buildMime(msg: MimeMessage): { raw: string; messageId: string } {
  const messageId = `<${randomUUID()}@${msg.messageIdDomain}>`;
  const headers = [
    `From: ${encodeHeader(msg.from)}`,
    `To: ${msg.to}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
  ];
  if (msg.inReplyTo) headers.push(`In-Reply-To: ${msg.inReplyTo}`, `References: ${msg.inReplyTo}`);
  const textPart = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(Buffer.from(msg.text, "utf8").toString("base64"))];

  if (!msg.attachments?.length) {
    return { raw: [...headers, ...textPart].join("\r\n"), messageId };
  }
  const boundary = `by-${randomUUID()}`;
  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    ...textPart,
    ...msg.attachments.flatMap((a) => [
      `--${boundary}`,
      `Content-Type: ${a.contentType}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(a.content.toString("base64")),
    ]),
    `--${boundary}--`,
  ];
  return { raw: parts.join("\r\n"), messageId };
}

export function base64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
