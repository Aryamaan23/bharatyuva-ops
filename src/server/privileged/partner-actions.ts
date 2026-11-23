"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { rateLimit } from "./rate-limit";
import { resolvePartnerToken, submitPartnerRequest } from "./partners";
import { clientIpHash } from "@/server/security/request";
import { kickDelivery } from "@/server/messaging/send";

const schema = z.object({ token: z.string().min(20).max(100), fromName: z.string().trim().max(120), message: z.string().trim().min(3).max(4000) });

/** Partner question/change form. Authorised by the private link token alone. */
export async function partnerRequestAction(formData: FormData): Promise<void> {
  const d = schema.safeParse(Object.fromEntries(formData));
  if (!d.success) return;
  if (!(await rateLimit("dataRequestPerIp", `partner:${await clientIpHash()}`))) redirect(`/partner/${d.data.token}?limited=1` as never);
  const access = await resolvePartnerToken(d.data.token);
  if (!access) redirect(`/partner/${d.data.token}` as never);
  await submitPartnerRequest(access.partnershipId, d.data.fromName, d.data.message);
  kickDelivery(10);
  redirect(`/partner/${d.data.token}?sent=1` as never);
}
