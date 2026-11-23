import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import { SiteFooter } from "./footer";
import { SiteHeader } from "./header";

/** Narrow single-column layout used by apply, portal and legal pages. */
export function PageShell({
  locale,
  t,
  path,
  title,
  children,
  contactEmail,
}: {
  locale: Locale;
  t: Dictionary;
  path: string;
  title: string;
  children: ReactNode;
  contactEmail?: string | null;
}) {
  return (
    <>
      <SiteHeader locale={locale} t={t} path={path} />
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="mb-6 text-3xl font-bold text-brand-navy">{title}</h1>
        {children}
      </main>
      <SiteFooter locale={locale} t={t} contactEmail={contactEmail} />
    </>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "success" }) {
  const cls =
    tone === "success"
      ? "border-green-700 bg-green-50"
      : tone === "warn"
        ? "border-brand-gold bg-brand-gold-soft"
        : "border-border bg-muted";
  return <div className={`rounded-md border-l-4 p-4 ${cls}`}>{children}</div>;
}
