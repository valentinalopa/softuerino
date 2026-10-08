import path from "node:path";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// "Esci" con SSO è un form che finisce con un redirect al logout di Keycloak:
// form-action vale anche per quel redirect, quindi l'origine di Keycloak va
// ammessa. Gli header si calcolano alla build, con l'.env del server.
function originOf(url: string | undefined) {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}
const keycloakOrigin = originOf(process.env.OIDC_ISSUER);

// CSP senza nonce (vedi la guida "content-security-policy" di Next): Next
// inserisce script inline, quindi 'unsafe-inline' resta; il guadagno vero è
// che niente arriva da altri domini e che l'app non si può mettere in un
// iframe altrui (clickjacking sui pulsanti Approva/Elimina).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  `form-action 'self'${keycloakOrigin ? ` ${keycloakOrigin}` : ""}`,
  "frame-ancestors 'none'",
  // In sviluppo si gira su http://localhost: niente upgrade a https.
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Solo HTTPS per un anno. I browser lo ignorano su http (sviluppo).
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  // Niente header "X-Powered-By: Next.js": non serve e rivela lo stack.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
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
