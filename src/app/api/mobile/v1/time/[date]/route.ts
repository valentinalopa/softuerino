import { revalidatePath } from "next/cache";
import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { getDay, saveDay } from "@/lib/services/time";

type P = { date: string };

// Ore di un giorno della persona stessa. PUT sostituisce tutte le righe del giorno
// ({entries: [{clientId, hours, note?}]}; elenco vuoto = giornata svuotata).
// Un membro non modifica una giornata già registrata (409); un admin sì.
export const GET = withMobileAuth<unknown, P>(async ({ user }, _req, route) => {
  const { date } = await route.params;
  return getDay({ id: user.id, role: user.role }, date);
});

export const PUT = withMobileAuth<unknown, P>(async ({ user, impersonating }, req, route) => {
  const { date } = await route.params;
  const body = await readJsonObject(req);
  const day = await saveDay({ id: user.id, role: user.role, impersonating }, date, body.entries);
  revalidatePath("/ore");
  revalidatePath(`/team/${user.id}`);
  revalidatePath("/");
  return day;
});
