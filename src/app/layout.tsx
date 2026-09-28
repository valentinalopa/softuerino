import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

// Colibrì DS: Clash Grotesk ovunque, titoli compresi (variabile, pesi 200–700).
const clashGrotesk = localFont({
  src: "./fonts/ClashGrotesk-Variable.woff2",
  weight: "200 700",
  variable: "--font-clash",
  display: "swap",
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
      className={`${clashGrotesk.variable} h-full antialiased`}
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
