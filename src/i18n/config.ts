export const locales = ["en", "hi"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "hi";
}

export const localeNames: Record<Locale, string> = { en: "English", hi: "हिन्दी" };
