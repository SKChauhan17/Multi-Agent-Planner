import type { Metadata } from "next";
import { Cormorant_Garamond, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "./providers";

const anthropicSerif = Cormorant_Garamond({
  variable: "--font-anthropic-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const anthropicSans = Source_Sans_3({
  variable: "--font-anthropic-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const anthropicMono = IBM_Plex_Mono({
  variable: "--font-anthropic-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Multi-Agent Task Architect",
  description: "Generate and optimize execution roadmaps intelligently.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${anthropicSerif.variable} ${anthropicSans.variable} ${anthropicMono.variable} antialiased min-h-screen`}>
        <Providers>
          {children}
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
