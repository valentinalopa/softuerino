import { revalidatePath } from "next/cache";
import { withMobileAuth } from "@/lib/mobile/http";
import { setOwnDayNotWorked } from "@/lib/services/time";

type P = { date: string };

// "Oggi non ho lavorato" della persona stessa (stesse regole del web, PR #50).
// PUT segna il giorno (400 se weekend/festivo, 409 se ha già ore); DELETE toglie
// il segno. Rispondono con il giorno aggiornato, come GET /v1/time/{date}.
function handler(notWorked: boolean) {
  return withMobileAuth<unknown, P>(async ({ user, impersonating }, _req, route) => {
    const { date } = await route.params;
    const day = await setOwnDayNotWorked({ id: user.id, role: user.role, impersonating }, date, notWorked);
    revalidatePath("/ore");
    revalidatePath(`/team/${user.id}`);
    revalidatePath("/");
    return day;
  });
}

export const PUT = handler(true);
export const DELETE = handler(false);
