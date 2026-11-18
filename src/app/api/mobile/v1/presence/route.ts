import { revalidatePath } from "next/cache";
import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { setPresence, deletePresence } from "@/lib/services/presence";

// Presenze della persona stessa: PUT imposta fascia e modalità su uno o più giorni
// (stessa regola del web: "giornata intera" sostituisce mattina/pomeriggio e
// viceversa); DELETE toglie le fasce di uno o più giorni. Niente userId.
const NO_CONTENT = () => new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });

export const PUT = withMobileAuth(async ({ user, impersonating }, req) => {
  const body = await readJsonObject(req);
  const presences = await setPresence({ id: user.id, role: user.role, impersonating }, body);
  revalidatePath("/calendario");
  return { presences };
});

export const DELETE = withMobileAuth(async ({ user, impersonating }, req) => {
  const body = await readJsonObject(req);
  await deletePresence({ id: user.id, role: user.role, impersonating }, body);
  revalidatePath("/calendario");
  return NO_CONTENT();
});
