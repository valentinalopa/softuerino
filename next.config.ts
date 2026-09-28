import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Radice esplicita: con un package-lock.json anche nella home, Next la
  // sceglieva come root e il watcher perdeva le modifiche a globals.css.
  turbopack: {
    root: path.join(__dirname),
  },
  // In sviluppo la cache su disco di Turbopack (attiva di default da 16.1)
  // continuava a servire un globals.css vecchio: la disattiviamo.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
