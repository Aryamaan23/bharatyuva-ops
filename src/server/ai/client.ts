import "server-only";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { logAiGeneration } from "@/server/privileged/ai-log";

/**
 * Claude for drafting and summarising only. Every output is logged in app.ai_generations and
 * shown to a person labelled as an AI draft; nothing is sent or decided by the model.
 */
let client: Anthropic | undefined;

export function aiConfigured(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY);
}

function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
  return client;
}

export type AiResult = { ok: true; text: string } | { ok: false; error: "not_configured" | "refused" | "rate_limited" | "failed" };

export async function generateText(input: {
  purpose: string;
  entity: string;
  entityId: string | null;
  system: string;
  prompt: string;
  maxTokens: number;
  effort: "low" | "medium" | "high";
  actorEmail: string | null;
}): Promise<AiResult> {
  if (!aiConfigured()) return { ok: false, error: "not_configured" };
  const model = env().ANTHROPIC_MODEL;
  try {
    const response = await anthropic().beta.messages.create({
      model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
      output_config: { effort: input.effort },
      // If the model declines, the API re-runs the request on a fallback model it picks by category.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") return { ok: false, error: "refused" };
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (!text) return { ok: false, error: "failed" };
    await logAiGeneration({
      purpose: input.purpose,
      entity: input.entity,
      entityId: input.entityId,
      model: response.model,
      promptHash: createHash("sha256").update(input.system + input.prompt).digest("hex"),
      output: text,
      createdBy: input.actorEmail,
    });
    return { ok: true, text };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "rate_limited" };
    if (err instanceof Anthropic.APIError) console.error(`Anthropic API error ${err.status}: ${err.message}`);
    else console.error("AI request failed", err);
    return { ok: false, error: "failed" };
  }
}
