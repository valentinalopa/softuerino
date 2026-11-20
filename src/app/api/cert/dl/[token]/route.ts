import { certResponse, readCertFile } from "@/lib/cert-files";
import { consumeCertLink } from "@/lib/cert-link";

// Download del Certificato Colibrì col link monouso creato dall'app
// (POST /api/mobile/v1/security/cert-link). Senza cookie né Bearer: il token
// (casuale, 5 minuti, una volta sola) è l'unica credenziale. Sconosciuto,
// usato o scaduto → 410. Sono file pubblici della CA interna.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = consumeCertLink(token);
  if (!link) return text("Link scaduto o già usato: chiedine uno nuovo dall'app", 410);

  const content = await readCertFile(link.file);
  if (!content) {
    link.release();
    return text("File non disponibile", 404);
  }
  console.info(`[cert] download ${link.file} con link monouso utente=${link.userId}`);
  return certResponse(link.file, content);
}

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
