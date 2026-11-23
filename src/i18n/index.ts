import "server-only";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "./config";
import { en, type Dictionary } from "./dictionaries/en";
import { hi } from "./dictionaries/hi";

const dictionaries: Record<Locale, Dictionary> = { en, hi };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** Resolve the [locale] route param, 404 for anything else. */
export async function resolveLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return locale;
}

/**
 * Hindi is reachable in development/preview always, and in production only once a native
 * speaker has reviewed the dictionary (hi.reviewed === true) and NEXT_PUBLIC_HINDI_ENABLED=true.
 */
export function hindiAvailable(): boolean {
  if (process.env.VERCEL_ENV !== "production") return true;
  return hi.reviewed && process.env.NEXT_PUBLIC_HINDI_ENABLED === "true";
}

export type { Dictionary, Locale };
