import { readFile } from "node:fs/promises";
import path from "node:path";
import { getAuthContext } from "@/lib/auth/session";

// Download del Certificato Colibrì (solo file pubblici della CA interna):
// profilo iOS/macOS (.mobileconfig), DMG per Mac e certificato CA (.crt) per
// Windows e Android. Come la VPN: serve il login
// (qualsiasi utente attivo) e non è disponibile durante un "vedi come".
// Whitelist fissa: dal client non arriva mai un percorso. I file stanno in
// CERT_FILES_DIR, fuori da public.
const FILES = {
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

type CertFile = keyof typeof FILES;

function isCertFile(name: string): name is CertFile {
  return Object.prototype.hasOwnProperty.call(FILES, name);
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const context = await getAuthContext();
  if (!context) return text("Accesso richiesto", 401);
  if (context.impersonating) {
    return text("Non disponibile mentre stai vedendo l'app come un altro utente", 403);
  }

  const { file } = await params;
  if (!isCertFile(file)) return text("File non trovato", 404);

  const dir = process.env.CERT_FILES_DIR || "/var/lib/softuerino/cert";
  let content: Buffer;
  try {
    content = await readFile(path.join(dir, FILES[file].diskName));
  } catch {
    return text("File non disponibile", 404);
  }

  // VpnDownload richiede una sezione VPN: qui basta una riga nel log del servizio.
  console.info(`[cert] download ${file} utente=${context.user.id}`);

  const meta = FILES[file];
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

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
