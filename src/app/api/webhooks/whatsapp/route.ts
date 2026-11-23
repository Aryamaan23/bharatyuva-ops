import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/server/security/crypto";
import { recordMessageEvent } from "@/server/privileged/message-events";
import { whatsappOptOut } from "@/server/privileged/whatsapp";

/** Meta webhook verification handshake. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const token = env().WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type WaPayload = {
  entry?: {
    changes?: {
      value?: {
        statuses?: { id: string; status: string; recipient_id: string }[];
        messages?: { from: string; type: string; text?: { body: string } }[];
      };
    }[];
  }[];
};

/** Delivery statuses and inbound messages. Signed with the app secret; idempotent. */
export async function POST(request: NextRequest) {
  const secret = env().WHATSAPP_APP_SECRET;
  const body = await request.text();
  const sig = request.headers.get("x-hub-signature-256") ?? "";
  if (!secret || !safeEqual(sig, `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const payload = JSON.parse(body) as WaPayload;
  for (const change of payload.entry?.flatMap((e) => e.changes ?? []) ?? []) {
    for (const s of change.value?.statuses ?? []) await recordMessageEvent({ providerId: s.id, kind: `whatsapp_${s.status}`, raw: s });
    for (const m of change.value?.messages ?? []) {
      if (m.type === "text" && /^\s*(stop|unsubscribe|band karo|बंद)\s*$/i.test(m.text?.body ?? "")) await whatsappOptOut(`+${m.from}`);
    }
  }
  return NextResponse.json({ ok: true });
}
