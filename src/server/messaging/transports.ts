import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";
import { env } from "@/lib/env";

export type EmailPayload = {
  to: string;
  subject: string;
  html: string | null;
  text: string;
  idempotencyKey: string;
};

export interface EmailTransportClient {
  send(msg: EmailPayload): Promise<{ providerId: string | null }>;
}

class ResendTransport implements EmailTransportClient {
  private client: Resend;
  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }
  async send(msg: EmailPayload) {
    const e = env();
    const { data, error } = await this.client.emails.send(
      {
        from: e.EMAIL_FROM,
        to: msg.to,
        replyTo: e.EMAIL_REPLY_TO,
        subject: msg.subject,
        html: msg.html ?? undefined,
        text: msg.text,
      },
      // Resend de-duplicates retries carrying the same key for 24 hours.
      { idempotencyKey: msg.idempotencyKey.slice(0, 256) },
    );
    if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
    return { providerId: data?.id ?? null };
  }
}

class SmtpTransport implements EmailTransportClient {
  private transporter: Transporter;
  constructor(host: string, port: number) {
    this.transporter = nodemailer.createTransport({ host, port, secure: false });
  }
  async send(msg: EmailPayload) {
    const e = env();
    const info = await this.transporter.sendMail({
      from: e.EMAIL_FROM,
      to: msg.to,
      replyTo: e.EMAIL_REPLY_TO,
      subject: msg.subject,
      html: msg.html ?? undefined,
      text: msg.text,
      headers: { "X-Idempotency-Key": msg.idempotencyKey },
    });
    return { providerId: info.messageId ?? null };
  }
}

let cached: EmailTransportClient | undefined;

export function emailTransport(): EmailTransportClient {
  if (!cached) {
    const e = env();
    if (e.EMAIL_TRANSPORT === "resend") {
      if (!e.RESEND_API_KEY) throw new Error("EMAIL_TRANSPORT=resend but RESEND_API_KEY is not set");
      cached = new ResendTransport(e.RESEND_API_KEY);
    } else {
      cached = new SmtpTransport(e.SMTP_HOST, e.SMTP_PORT);
    }
  }
  return cached;
}
