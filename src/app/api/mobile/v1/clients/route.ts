import { revalidatePath } from "next/cache";
import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { createClient, listClients } from "@/lib/services/clients";

// Clienti (elenco completo e creazione): admin o chi ha il permesso "Aggiungere
// clienti". Chi non è admin crea solo clienti semplici (parentId/loggerIds → 403).
// I clienti su cui registrare ore restano in /v1/time/clients.
export const GET = withMobileAuth(async ({ user, impersonating }) => {
  return { clients: await listClients({ id: user.id, role: user.role, impersonating }) };
});

export const POST = withMobileAuth(async ({ user, impersonating }, req) => {
  const client = await createClient({ id: user.id, role: user.role, impersonating }, await readJsonObject(req));
  revalidatePath("/clienti");
  revalidatePath("/ore");
  return Response.json({ client }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
});
