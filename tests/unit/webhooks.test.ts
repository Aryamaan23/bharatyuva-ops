import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySvix } from "@/server/security/svix";

const rawKey = Buffer.from("test-signing-key-32-bytes-long!!");
const secret = `whsec_${rawKey.toString("base64")}`;
const sign = (id: string, ts: string, body: string) => `v1,${createHmac("sha256", rawKey).update(`${id}.${ts}.${body}`).digest("base64")}`;

describe("Svix webhook verification", () => {
  const body = JSON.stringify({ type: "email.bounced", data: { email_id: "abc" } });
  const ts = "1800000000";
  it("accepts a valid signature (including among several)", () => {
    expect(verifySvix({ secret, id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body), body, nowSeconds: 1800000010 })).toBe(true);
    expect(verifySvix({ secret, id: "msg_1", timestamp: ts, signature: `v1,old ${sign("msg_1", ts, body)}`, body, nowSeconds: 1800000010 })).toBe(true);
  });
  it("rejects tampering, stale timestamps and wrong secrets", () => {
    expect(verifySvix({ secret, id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body), body: body + " ", nowSeconds: 1800000010 })).toBe(false);
    expect(verifySvix({ secret, id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body), body, nowSeconds: 1800001000 })).toBe(false);
    expect(verifySvix({ secret: `whsec_${Buffer.from("other").toString("base64")}`, id: "msg_1", timestamp: ts, signature: sign("msg_1", ts, body), body, nowSeconds: 1800000010 })).toBe(false);
  });
});
