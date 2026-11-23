import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once on first use. Every variable is documented in .env.example.
 * Parsing lazily (instead of at import time) lets `next build` run without production secrets.
 */
const boolish = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  NEXT_PUBLIC_APP_URL: z.url(),

  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),

  CRON_SECRET: z.string().min(16),
  HASH_SALT: z.string().min(16),
  TOKEN_SIGNING_SECRET: z.string().min(32),
  OWNER_EMAILS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),

  MESSAGE_MODE: z.enum(["log", "redirect", "live"]).default("log"),
  EMAIL_TRANSPORT: z.enum(["resend", "smtp"]).default("smtp"),
  TEST_INBOX: z.email().optional(),
  EMAIL_FROM: z.string().min(3).default("Bharat Yuva <hello@localhost>"),
  EMAIL_REPLY_TO: z.email().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_DAILY_CAP: z.coerce.number().int().positive().default(100),
  /** "whsec_…" signing secret from the Resend webhook settings. */
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  SMTP_HOST: z.string().default("127.0.0.1"),
  SMTP_PORT: z.coerce.number().int().default(54325),

  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** base64 of 32 random bytes: `openssl rand -base64 32`. Encrypts Gmail refresh tokens. */
  GMAIL_TOKEN_KEY: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),

  FEATURE_WHATSAPP: boolish,
  WHATSAPP_PROVIDER: z.enum(["console", "meta"]).default("console"),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (!cached) {
    // `FOO=` in an env file means "not set", not an empty string.
    const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
    const parsed = serverSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example.`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function isProduction(): boolean {
  return env().VERCEL_ENV === "production";
}
