import type { Metadata } from "next";
import Link from "next/link";
import { sourceSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = { title: "Page not found · Bharat Yuva" };

export default function GlobalNotFound() {
  return (
    <html lang="en" className={sourceSans.variable}>
      <body className="flex min-h-dvh items-center justify-center bg-white px-4 font-sans">
        <main className="max-w-md text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">404</p>
          <h1 className="mt-2 text-3xl font-bold text-brand-navy">Page not found</h1>
          <p className="mt-3" lang="hi">
            यह पेज नहीं मिला।
          </p>
          <Link href="/en" className="mt-6 inline-block rounded-md bg-brand-navy px-5 py-3 font-semibold text-white">
            Bharat Yuva home
          </Link>
        </main>
      </body>
    </html>
  );
}
