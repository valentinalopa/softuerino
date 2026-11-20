import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { decideLeaveRequest } from "@/lib/services/leave";

type P = { id: string };

function revalidateLeave(userId: string) {
  revalidatePath("/team");
  revalidatePath("/richieste");
  revalidatePath("/panoramica");
  revalidatePath(`/team/${userId}`);
  revalidatePath("/calendario");
  revalidatePath("/");
}

// Approva o rifiuta una richiesta di un'altra persona, con le stesse regole del
// web (decideLeaveRequest). Corpo {status: "approved"|"rejected", version, note?}.
// `note` (facoltativa, max 500 caratteri, oltre → 400): la vede il richiedente.
// Dall'app la versione è obbligatoria: senza, o se la richiesta è cambiata → 409.
// 403: proprie richieste, malattia/104 da non admin, fuori ambito, "vedi come".
// 404: richiesta inesistente. 409: già decisa o ritirata. Mail a chi l'ha fatta.
export const POST = withMobileAuth<unknown, P>(async ({ user, impersonating }, req, route) => {
  const { id } = await route.params;
  const body = await readJsonObject(req);
  const { userId, request, notify } = await decideLeaveRequest(
    { id: user.id, role: user.role, employmentType: user.employmentType, impersonating },
    id,
    body.status,
    body.version,
    { requireVersion: true, note: body.note }
  );
  revalidateLeave(userId);
  after(notify);
  return { request };
});
