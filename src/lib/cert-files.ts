import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

// File pubblici della CA interna (profilo iOS/macOS, DMG per Mac, .crt per
// Windows e Android). Whitelist fissa: dal client non arriva mai un percorso. I
// file stanno in CERT_FILES_DIR, fuori da public.
export const CERT_FILES = {
  "colibri.mobileconfig": {
    diskName: "colibri.mobileconfig",
    contentType: "application/x-apple-aspen-config",
    downloadName: "Certificato-Colibri-Vision.mobileconfig",
  },
  "colibri.dmg": {
    diskName: "colibri.dmg",
    contentType: "application/x-apple-diskimage",
    downloadName: "Certificato-Colibri-Vision.dmg",
  },
  crt: {
    diskName: "root.crt",
    contentType: "application/x-x509-ca-cert",
    downloadName: "Colibri-Vision-Root-CA.crt",
  },
} as const;

export type CertFile = keyof typeof CERT_FILES;

export function isCertFile(name: string): name is CertFile {
  return Object.prototype.hasOwnProperty.call(CERT_FILES, name);
}

// Contenuto del file o null se non c'è sul disco.
export async function readCertFile(file: CertFile): Promise<Buffer | null> {
  const dir = process.env.CERT_FILES_DIR || "/var/lib/softuerino/cert";
  try {
    return await readFile(path.join(dir, CERT_FILES[file].diskName));
  } catch {
    return null;
  }
}

// Risposta di download (stessi header del web).
export function certResponse(file: CertFile, content: Buffer) {
  const meta = CERT_FILES[file];
  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": meta.contentType,
      "Content-Disposition": `attachment; filename="${meta.downloadName}"`,
      "Content-Length": String(content.length),
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
