import Link from "next/link";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { hindiAvailable, type Dictionary } from "@/i18n";

export function SiteHeader({ locale, t, path = "" }: { locale: Locale; t: Dictionary; path?: string }) {
  const showSwitch = hindiAvailable();
  return (
    <header className="border-b border-border bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand-gold focus:px-3 focus:py-2 focus:text-brand-navy"
      >
        {t.common.skipToContent}
      </a>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href={`/${locale}`} className="flex items-center gap-2 font-bold text-brand-navy">
          <svg aria-hidden="true" viewBox="0 0 64 64" className="size-8">
            <rect width="64" height="64" rx="12" fill="#273661" />
            <path d="M14 46 L32 14 L50 46 Z" fill="none" stroke="#F2C744" strokeWidth="6" strokeLinejoin="round" />
            <circle cx="32" cy="36" r="5" fill="#F2C744" />
          </svg>
          <span className="text-lg leading-tight">
            {t.common.programme}
            <span className="block text-xs font-normal text-muted-foreground">{t.common.org}</span>
          </span>
        </Link>
        <nav aria-label={t.common.language} className="flex items-center gap-3 text-sm">
          {showSwitch &&
            locales
              .filter((l) => l !== locale)
              .map((l) => (
                <Link key={l} href={`/${l}${path}`} hrefLang={l} lang={l} className="underline underline-offset-4">
                  {localeNames[l]}
                </Link>
              ))}
          <Link href={`/${locale}/me`} className="rounded-md border border-brand-navy px-3 py-1.5 font-semibold text-brand-navy">
            {t.common.myApplication}
          </Link>
        </nav>
      </div>
    </header>
  );
}
