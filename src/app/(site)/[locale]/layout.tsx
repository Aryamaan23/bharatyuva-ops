import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { locales } from "@/i18n/config";
import { getDictionary, resolveLocale } from "@/i18n";
import { devanagari, sourceSans } from "../../fonts";
import "../../globals.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getDictionary(locale);
  return {
    title: { default: t.meta.title, template: `%s · ${t.common.programme}` },
    description: t.meta.description,
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    alternates: { languages: { en: "/en", hi: "/hi" } },
  };
}

export default async function SiteLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = await resolveLocale(params);
  return (
    <html lang={locale} className={`${sourceSans.variable} ${locale === "hi" ? devanagari.variable : ""}`}>
      <body className="flex min-h-dvh flex-col bg-white font-sans text-foreground antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
