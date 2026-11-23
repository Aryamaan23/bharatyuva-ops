import "server-only";
import { env } from "@/lib/env";

/**
 * WhatsApp sending behind one interface so the provider can be swapped (Meta Cloud API today;
 * AiSensy/Interakt/Gupshup would each be one more class). Only approved template messages are
 * sent, and only to applicants who opted in.
 */
export type TemplateMessage = { to: string; template: string; language: "en" | "hi"; params: string[] };

export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(msg: TemplateMessage): Promise<{ id: string }>;
}

export class ConsoleWhatsApp implements WhatsAppProvider {
  readonly name = "console";
  async sendTemplate(msg: TemplateMessage) {
    console.info("[whatsapp:console]", msg.template, msg.language, msg.to.replace(/\d(?=\d{4})/g, "•"), msg.params);
    return { id: `console-${Date.now()}` };
  }
}

export class MetaCloudWhatsApp implements WhatsAppProvider {
  readonly name = "meta";
  constructor(
    private token: string,
    private phoneNumberId: string,
  ) {}
  async sendTemplate(msg: TemplateMessage) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: msg.template,
          language: { code: msg.language === "hi" ? "hi" : "en" },
          components: msg.params.length ? [{ type: "body", parameters: msg.params.map((text) => ({ type: "text", text })) }] : [],
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
    if (!res.ok || !data.messages?.[0]) throw new Error(`WhatsApp: ${data.error?.message ?? res.status}`);
    return { id: data.messages[0].id };
  }
}

/** Real sending only in production with the flag on and Meta configured; otherwise console. */
export function whatsappProvider(): WhatsAppProvider {
  const e = env();
  if (e.VERCEL_ENV === "production" && e.FEATURE_WHATSAPP && e.WHATSAPP_PROVIDER === "meta" && e.WHATSAPP_TOKEN && e.WHATSAPP_PHONE_NUMBER_ID) {
    return new MetaCloudWhatsApp(e.WHATSAPP_TOKEN, e.WHATSAPP_PHONE_NUMBER_ID);
  }
  return new ConsoleWhatsApp();
}
