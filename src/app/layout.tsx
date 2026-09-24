import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import { Anton } from "next/font/google";
import "./globals.css";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

// Colibrì DS: Clash Grotesk per testo e UI (variabile, pesi 200–700),
// Anton per i titoli (peso unico 400).
const clashGrotesk = localFont({
  src: "./fonts/ClashGrotesk-Variable.woff2",
  weight: "200 700",
  variable: "--font-clash",
  display: "swap",
});

const anton = Anton({
  weight: "400",
  variable: "--font-anton",
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
      className={`${clashGrotesk.variable} ${anton.variable} h-full antialiased`}
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
