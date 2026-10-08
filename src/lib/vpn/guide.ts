// Guida al collegamento VPN con OpenVPN Connect, per dispositivo. Ogni guida
// ha 4 passi, uno per scena dell'animazione public/lottie/vpn-<key>.json
// (generata da scripts/lottie/vpn-guide.mjs: 90 fotogrammi per scena).

export const VPN_STEP_FRAMES = 90;

export const VPN_PLATFORMS = ["ios", "android", "macos", "windows"] as const;
export type VpnPlatform = (typeof VPN_PLATFORMS)[number];

type Guide = {
  label: string;
  app: { href: string; label: string };
  steps: [string, string, string, string];
};

const DOWNLOAD_STEP_DESKTOP =
  "Clicca «Scarica configurazione» sulla VPN che ti serve, qui sopra: scarichi il file .ovpn.";
const LOGIN_STEP = "Inserisci utente e password del tuo account aziendale e attiva il collegamento.";

export const VPN_GUIDES: Record<VpnPlatform, Guide> = {
  ios: {
    label: "iPhone e iPad",
    app: { href: "https://apps.apple.com/app/openvpn-connect/id590379981", label: "Apri l'App Store" },
    steps: [
      "Installa OpenVPN Connect dall'App Store.",
      "Tocca «Scarica configurazione» sulla VPN che ti serve, aprendo il link in Safari, e scarica il file.",
      "Apri il file in OpenVPN (oppure Condividi → OpenVPN) e conferma l'importazione del profilo.",
      LOGIN_STEP,
    ],
  },
  android: {
    label: "Android",
    app: { href: "https://play.google.com/store/apps/details?id=net.openvpn.openvpn", label: "Apri Google Play" },
    steps: [
      "Installa OpenVPN Connect da Google Play.",
      "Tocca «Scarica configurazione» sulla VPN che ti serve: il file .ovpn finisce nei Download.",
      "In OpenVPN Connect scegli Importa profilo → File (Upload File) e seleziona il file scaricato.",
      LOGIN_STEP,
    ],
  },
  macos: {
    label: "Mac",
    app: { href: "https://openvpn.net/downloads/openvpn-connect-v3-macos.dmg", label: "Scarica per Mac" },
    steps: [
      "Scarica OpenVPN Connect per Mac, apri il file .dmg e installalo.",
      DOWNLOAD_STEP_DESKTOP,
      "In OpenVPN Connect scegli Importa profilo → Upload File e trascina il file scaricato nella finestra.",
      LOGIN_STEP,
    ],
  },
  windows: {
    label: "Windows",
    app: { href: "https://openvpn.net/downloads/openvpn-connect-v3-windows.msi", label: "Scarica per Windows" },
    steps: [
      "Scarica OpenVPN Connect per Windows e installalo.",
      DOWNLOAD_STEP_DESKTOP,
      "In OpenVPN Connect scegli Importa profilo → Upload File e trascina il file scaricato nella finestra.",
      LOGIN_STEP,
    ],
  },
};

// Pagina ufficiale con tutte le versioni (Linux, ChromeOS, versioni precedenti...).
export const OPENVPN_CLIENT_PAGE = "https://openvpn.net/client/";

export function detectVpnPlatform(userAgent: string, maxTouchPoints = 0): VpnPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  // iPadOS si presenta come un Mac: lo tradisce il touch.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "macos";
  return "windows";
}
