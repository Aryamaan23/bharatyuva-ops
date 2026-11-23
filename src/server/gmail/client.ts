import "server-only";
import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { base64url } from "./mime";
import { refreshAccessToken } from "./oauth";

export type ThreadMessage = {
  id: string;
  internalDate: Date;
  from: string;
  subject: string;
  body: string;
  headers: Record<string, string>;
};

export interface GmailClient {
  readonly kind: "google" | "local";
  send(raw: string, threadId?: string | null): Promise<{ id: string; threadId: string }>;
  getThread(threadId: string): Promise<ThreadMessage[]>;
}

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: { name: string; value: string }[] };

function textFromPayload(part: GmailPart): string {
  if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const p of part.parts ?? []) {
    const t = textFromPayload(p);
    if (t) return t;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8").replace(/<[^>]+>/g, " ");
  }
  return "";
}

/** Gmail REST API as the connected staff member. */
export class GoogleGmailClient implements GmailClient {
  readonly kind = "google" as const;
  private accessToken: string | null = null;
  constructor(private refreshToken: string) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    this.accessToken ??= await refreshAccessToken(this.refreshToken);
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Gmail API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  async send(raw: string, threadId?: string | null) {
    const body = JSON.stringify({ raw: base64url(raw), ...(threadId ? { threadId } : {}) });
    return this.call<{ id: string; threadId: string }>("/messages/send", { method: "POST", body });
  }

  async getThread(threadId: string): Promise<ThreadMessage[]> {
    const t = await this.call<{ messages?: { id: string; internalDate: string; payload: GmailPart }[] }>(
      `/threads/${encodeURIComponent(threadId)}?format=full`,
    );
    return (t.messages ?? []).map((m) => {
      const headers = Object.fromEntries((m.payload.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
      return {
        id: m.id,
        internalDate: new Date(Number(m.internalDate)),
        from: headers.from ?? "",
        subject: headers.subject ?? "",
        body: textFromPayload(m.payload),
        headers,
      };
    });
  }
}

/**
 * Development stand-in when Google OAuth isn't configured: delivers over SMTP to Mailpit and
 * invents thread ids. Replies are simulated from the partner page ("Simulate reply", dev only).
 */
export class LocalGmailClient implements GmailClient {
  readonly kind = "local" as const;
  async send(raw: string, threadId?: string | null) {
    const e = env();
    const transporter = nodemailer.createTransport({ host: e.SMTP_HOST, port: e.SMTP_PORT, secure: false });
    const to = raw.match(/^To: (.+)$/m)?.[1] ?? "";
    const from = raw.match(/^From: (.+)$/m)?.[1] ?? "";
    await transporter.sendMail({ envelope: { from: from.match(/<(.+)>/)?.[1] ?? from, to }, raw });
    return { id: `local-${randomUUID()}`, threadId: threadId ?? `local-thread-${randomUUID()}` };
  }
  async getThread(): Promise<ThreadMessage[]> {
    return [];
  }
}
