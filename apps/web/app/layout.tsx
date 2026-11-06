import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono, Space_Grotesk, Syne } from "next/font/google";
import { GeistPixelSquare } from "geist/font/pixel/square";

import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

/*
 * The product UI only. The marketing pages and the explainer keep Space
 * Grotesk and Bricolage; the workspace is a tool, and a neutral grotesk is what
 * stops a dense table of amounts from looking styled.
 */
const ui = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

/*
 * The wordmark only: the name beside the logo. A geometric display face with
 * a distinctive wide, low-slung "w", so the name reads as a mark and not as
 * more body text. Nothing else in the product uses it.
 */
const brand = Syne({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-brand",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Zowall - No PO, no pay",
  description:
    "Three-way invoice match for agents that hold a wallet. USDT on Whitechain, refusals on Hedera HCS.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${ui.variable} ${mono.variable} ${GeistPixelSquare.variable} ${brand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
