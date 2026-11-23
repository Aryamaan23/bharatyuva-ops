import "server-only";
import { headers } from "next/headers";
import { hashValue } from "./crypto";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function clientIpHash(): Promise<string> {
  return hashValue(await clientIp());
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? null;
}
