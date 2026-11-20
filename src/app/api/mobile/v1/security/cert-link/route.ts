import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { ForbiddenError } from "@/lib/task-archive";
import { ValidationError } from "@/lib/services/errors";
import { createCertLink } from "@/lib/cert-link";

// Link monouso (5 minuti) per scaricare il profilo del Certificato Colibrì da
// Safari, che non ha il Bearer. Corpo {file:"mobileconfig"}. 403 in "vedi come".
export const POST = withMobileAuth(async ({ user, impersonating }, req) => {
  const body = await readJsonObject(req);
  if (body.file !== "mobileconfig") throw new ValidationError('Il campo "file" deve essere "mobileconfig".');
  if (impersonating) {
    throw new ForbiddenError("Non disponibile mentre stai vedendo l'app come un altro utente");
  }
  const { token, expiresAt } = createCertLink("colibri.mobileconfig", user.id);
  console.info(`[cert] link creato file=mobileconfig utente=${user.id}`);
  // Base del link: CERT_LINK_BASE_URL (senza "/" finale) per provare su un altro server (per esempio :3100);
  // in produzione non si imposta e vale il sito pubblico.
  const base = (process.env.CERT_LINK_BASE_URL || "https://time.colibrivision.it").replace(/\/+$/, "");
  return { url: `${base}/api/cert/dl/${token}`, expiresAt: expiresAt.toISOString() };
});
