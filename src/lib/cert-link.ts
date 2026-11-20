import "server-only";
import { randomBytes } from "node:crypto";
import type { CertFile } from "@/lib/cert-files";

// Link di download monouso del Certificato Colibrì per l'app iPhone: Safari
// (che scarica il profilo) non ha il Bearer, quindi l'app chiede un link col
// token casuale, valido 5 minuti e una volta sola. Resta in memoria del
// processo: un riavvio li annulla (basta chiederne un altro). Il token è
// l'unica credenziale: non viene mai scritto nei log.
export const CERT_LINK_TTL_MS = 5 * 60 * 1000;

type Entry = { file: CertFile; userId: string; expiresAt: number; used: boolean };
const links = new Map<string, Entry>();

function prune(now: number) {
  for (const [token, e] of links) if (e.expiresAt <= now) links.delete(token);
}

export function createCertLink(file: CertFile, userId: string, now = Date.now()) {
  prune(now);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + CERT_LINK_TTL_MS;
  links.set(token, { file, userId, expiresAt, used: false });
  return { token, expiresAt: new Date(expiresAt) };
}

// Prenota il link (monouso): null se sconosciuto, già usato o scaduto (→ 410).
// Se poi il file non si legge, release() lo rende di nuovo utilizzabile.
export function consumeCertLink(token: string, now = Date.now()) {
  const e = links.get(token);
  if (!e || e.used || e.expiresAt <= now) {
    if (e && e.expiresAt <= now) links.delete(token);
    return null;
  }
  e.used = true;
  return { file: e.file, userId: e.userId, release: () => void (e.used = false) };
}

// Solo per i test.
export function clearCertLinks() {
  links.clear();
}
