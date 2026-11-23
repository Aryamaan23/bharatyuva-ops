import { Noto_Sans_Devanagari, Source_Sans_3 } from "next/font/google";

export const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
});

// Source Sans 3 has no Devanagari glyphs; this is only downloaded when Hindi text is rendered.
export const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "600", "700"],
  variable: "--font-devanagari",
  display: "swap",
  preload: false,
});
