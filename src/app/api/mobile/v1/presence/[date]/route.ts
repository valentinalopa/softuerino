import { revalidatePath } from "next/cache";
import { withMobileAuth } from "@/lib/mobile/http";
import { deletePresence } from "@/lib/services/presence";

type P = { date: string };

// Toglie le presenze di un giorno: tutte le fasce, oppure solo ?slot=mattina|pomeriggio|giornata_intera.
export const DELETE = withMobileAuth<unknown, P>(async ({ user, impersonating }, req, route) => {
  const { date } = await route.params;
  const slot = new URL(req.url).searchParams.get("slot") ?? undefined;
  await deletePresence({ id: user.id, role: user.role, impersonating }, { dates: [date], slot });
  revalidatePath("/calendario");
  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
});
