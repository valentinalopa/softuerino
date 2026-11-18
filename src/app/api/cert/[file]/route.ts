import { getAuthContext } from "@/lib/auth/session";
import { certResponse, isCertFile, readCertFile } from "@/lib/cert-files";

// Download del Certificato Colibrì (solo file pubblici della CA interna):
// profilo iOS/macOS (.mobileconfig), DMG per Mac e certificato CA (.crt) per
// Windows e Android. Come la VPN: serve il login
// (qualsiasi utente attivo) e non è disponibile durante un "vedi come".
// La whitelist dei file è in lib/cert-files.ts (condivisa con il link monouso
// dell'app, /api/cert/dl/[token]).
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const context = await getAuthContext();
  if (!context) return text("Accesso richiesto", 401);
  if (context.impersonating) {
    return text("Non disponibile mentre stai vedendo l'app come un altro utente", 403);
  }

  const { file } = await params;
  if (!isCertFile(file)) return text("File non trovato", 404);

  const content = await readCertFile(file);
  if (!content) return text("File non disponibile", 404);

  // VpnDownload richiede una sezione VPN: qui basta una riga nel log del servizio.
  console.info(`[cert] download ${file} utente=${context.user.id}`);
  return certResponse(file, content);
}

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
