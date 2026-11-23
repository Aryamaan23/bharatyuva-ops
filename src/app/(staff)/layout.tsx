import type { Metadata } from "next";
import { sourceSans } from "../fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: "Bharat Yuva Ops", template: "%s · Bharat Yuva Ops" },
  robots: { index: false, follow: false },
};

export default function StaffRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sourceSans.variable}>
      <body className="min-h-dvh bg-muted/40 font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
