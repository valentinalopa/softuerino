import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { getOwnLeaveRequest, updateOwnLeaveRequest, withdrawOwnLeaveRequest } from "@/lib/services/leave";

type P = { id: string };

function revalidateLeave(userId: string) {
  revalidatePath("/team");
  revalidatePath("/richieste");
  revalidatePath("/panoramica");
  revalidatePath(`/team/${userId}`);
  revalidatePath("/calendario");
  revalidatePath("/");
}

// Una richiesta propria. Quelle di altri rispondono 404.
export const GET = withMobileAuth<unknown, P>(async ({ user, impersonating }, _req, route) => {
  const { id } = await route.params;
  const request = await getOwnLeaveRequest(
    { id: user.id, role: user.role, employmentType: user.employmentType, impersonating },
    id
  );
  return { request };
});

// Modifica di una propria richiesta in attesa (stesse regole del web): resta in
// attesa con i nuovi dati e i responsabili ricevono di nuovo l'avviso. 409 se
// nel frattempo è stata decisa.
export const PATCH = withMobileAuth<unknown, P>(async ({ user, impersonating }, req, route) => {
  const { id } = await route.params;
  const body = await readJsonObject(req);
  const actor = { id: user.id, role: user.role, employmentType: user.employmentType, impersonating };
  const { notify } = await updateOwnLeaveRequest(actor, id, {
    type: body.type,
    startDate: body.startDate,
    endDate: body.endDate,
    startTime: body.startTime,
    endTime: body.endTime,
    note: body.note,
    recoveryCreditId: body.recoveryCreditId,
    unit: body.unit,
    version: body.version,
  });
  revalidateLeave(user.id);
  after(notify);
  return { request: await getOwnLeaveRequest(actor, id) };
});

// Ritiro di una propria richiesta in attesa: come sul web la richiesta viene
// tolta e i responsabili avvisati (decisione di Giacomo, opzione A). 409 se già decisa.
export const DELETE = withMobileAuth<unknown, P>(async ({ user, impersonating }, req, route) => {
  const { id } = await route.params;
  const { notify } = await withdrawOwnLeaveRequest(
    { id: user.id, role: user.role, employmentType: user.employmentType, impersonating },
    id,
    undefined,
    new URL(req.url).searchParams.get("version")
  );
  revalidateLeave(user.id);
  after(notify);
  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
});
