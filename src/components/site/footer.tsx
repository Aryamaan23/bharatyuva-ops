import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";

export function SiteFooter({ locale, t, contactEmail }: { locale: Locale; t: Dictionary; contactEmail?: string | null }) {
  return (
    <footer className="mt-16 bg-brand-navy text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>{t.footer.tagline}</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          <li>
            <Link href={`/${locale}/privacy`} className="underline underline-offset-4">
              {t.common.privacy}
            </Link>
          </li>
          <li>
            <Link href={`/${locale}/data-request`} className="underline underline-offset-4">
              {t.common.dataRequest}
            </Link>
          </li>
          {contactEmail && (
            <li>
              {t.common.contact}: <span className="select-all">{contactEmail}</span>
            </li>
          )}
        </ul>
      </div>
    </footer>
  );
}
