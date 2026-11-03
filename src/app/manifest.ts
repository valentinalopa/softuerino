import type { MetadataRoute } from "next";

// Rende Softuerino installabile come web app (iPhone: Condividi > Aggiungi alla
// schermata Home, apertura a schermo intero). Niente service worker: serve solo
// il manifest. Colori = tema chiaro (--background di globals.css).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Softuerino",
    short_name: "Softuerino",
    description: "Gestionale per team: ferie, permessi, presenze, calendario e ore",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#f8fafc",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
