import type { Metadata } from "next";
import { sourceSans } from "../fonts";
import "../globals.css";

export const metadata: Metadata = { title: "Bharat Yuva · Partner page", robots: { index: false, follow: false } };

export default function PartnerRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sourceSans.variable}>
      <body className="min-h-dvh bg-white font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
