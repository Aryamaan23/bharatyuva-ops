import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Keyed hash for values we must not store in clear (IPs, emails kept as deletion proof). */
export function hashValue(value: string): string {
  return createHmac("sha256", env().HASH_SALT).update(value.trim().toLowerCase()).digest("hex");
}

/** A random single-use token. Store only its sha256 (see hashToken) and email the raw value. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
