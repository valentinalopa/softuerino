import { requireSuperAdmin } from "@/lib/auth/session";
import { getUpdateStatusResponse } from "@/lib/system/update";

// Stato degli aggiornamenti per il polling della pagina. È una route e non una
// server action perché deve continuare a rispondere anche dopo il riavvio
// sulla nuova versione, quando gli ID delle server action sono cambiati.
export async function GET() {
  await requireSuperAdmin();
  return Response.json(await getUpdateStatusResponse(), {
    headers: { "Cache-Control": "no-store" },
  });
}
