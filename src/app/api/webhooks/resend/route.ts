import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { recordMessageEvent } from "@/server/privileged/message-events";
import { verifySvix } from "@/server/security/svix";

/** Resend delivery events (Svix-signed). Recorded once each against the outbox row. */
export async function POST(request: NextRequest) {
  const secret = env().RESEND_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("Not configured", { status: 503 });
  const body = await request.text();
  const ok = verifySvix({
    secret,
    id: request.headers.get("svix-id") ?? "",
    timestamp: request.headers.get("svix-timestamp") ?? "",
    signature: request.headers.get("svix-signature") ?? "",
    body,
  });
  if (!ok) return new NextResponse("Invalid signature", { status: 401 });
  const event = JSON.parse(body) as { type?: string; data?: { email_id?: string } };
  if (event.type && event.data?.email_id) {
    await recordMessageEvent({ providerId: event.data.email_id, kind: event.type, raw: event });
  }
  return NextResponse.json({ ok: true });
}
