import type { Metadata } from "next";
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
      <head>
        {/* Applica il tema salvato prima del primo paint (niente flash).
            Script inline nel <head> del root layout, come nella guida
            "preventing-flash-before-hydration" di Next: <Script
            beforeInteractive> dentro il body fa scattare l'errore React
            "Encountered a script tag while rendering React component". La
            CSP ammette gli script inline ('unsafe-inline', next.config.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
