import "server-only";
import { headers } from "next/headers";

// Richiesta arrivata dal percorso pubblico (internet → Cloudflare → reverse
// proxy). Lo segnala Nginx sulla VM con l'header X-Softuerino-Network:
// "public" nel blocco del nome pubblico; il blocco interno lo azzera sempre,
// così un client non può falsificarlo in nessuno dei due casi.
export async function isPublicRequest() {
  return (await headers()).get("x-softuerino-network") === "public";
}

// Reti da cui il super admin può esercitare i suoi poteri (decisione elemento
// #310): ufficio 192.168.1.0/24, VPN di controllo 192.168.11.0/24, VPN
// 192.168.5.0/24. Fisse nel codice, non nel .env.
const TRUSTED_NETS: readonly (readonly [string, number])[] = [
  ["192.168.1.0", 24],
  ["192.168.11.0", 24],
  ["192.168.5.0", 24],
];

// IPv4 puntato → intero senza segno; null se non è un IPv4 valido.
function ipv4ToInt(ip: string): number | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// Vero se l'IP (IPv4) cade in una delle reti fidate. Qualunque altra cosa
// (assente, IPv6, valore con virgole, testo) è falso: fail-closed.
export function isTrustedIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const value = ipv4ToInt(ip);
  if (value === null) return false;
  return TRUSTED_NETS.some(([net, bits]) => {
    const base = ipv4ToInt(net) as number;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((value & mask) >>> 0) === ((base & mask) >>> 0);
  });
}

// La richiesta arriva dalla rete interna fidata? Decide il server: l'IP reale
// del socket lo conosce solo Nginx sulla VM, che lo scrive in X-Real-IP
// sovrascrivendo ogni valore del client (proxy_set_header X-Real-IP
// $remote_addr, in entrambi i blocchi). Serve anche che la richiesta NON venga
// dal blocco pubblico (X-Softuerino-Network ≠ "public"): il reverse proxy
// pubblico (192.168.40.142) non è comunque in una rete fidata. X-Forwarded-For
// e Host non si leggono mai: il client può falsificarli.
export async function isTrustedNetwork(): Promise<boolean> {
  const requestHeaders = await headers();
  if (requestHeaders.get("x-softuerino-network") === "public") return false;
  return isTrustedIp(requestHeaders.get("x-real-ip"));
}

// Nome con cui è stata chiesta la pagina (es. per scegliere il redirect SSO).
export async function requestHost() {
  return (await headers()).get("host");
}
