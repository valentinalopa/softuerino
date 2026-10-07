import "server-only";
import { headers } from "next/headers";

// Richiesta arrivata dal percorso pubblico (internet → Cloudflare → reverse
// proxy). Lo segnala Nginx sulla VM con l'header X-Softuerino-Network:
// "public" nel blocco del nome pubblico; il blocco interno lo azzera sempre,
// così un client non può falsificarlo in nessuno dei due casi.
export async function isPublicRequest() {
  return (await headers()).get("x-softuerino-network") === "public";
}

// Nome con cui è stata chiesta la pagina (es. per scegliere il redirect SSO).
export async function requestHost() {
  return (await headers()).get("host");
}
