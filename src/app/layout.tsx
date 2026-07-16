import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Softuerino | Gestionale team",
  description:
    "Gestionale per team: ferie, permessi, malattia, presenze, calendario e ore",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Applica il tema salvato prima del primo paint (niente flash):
            next/script beforeInteractive è il canale canonico, senza il
            warning React sui tag <script> renderizzati nei componenti. */}
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
