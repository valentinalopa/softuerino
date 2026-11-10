import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { createLeaveRequest, listOwnLeaveRequests } from "@/lib/services/leave";
import { ValidationError } from "@/lib/services/errors";

// Richieste di assenza della persona stessa. GET: elenco (?year=YYYY opzionale).
// POST: nuova richiesta; la mail ai responsabili parte una volta sola, dopo il
// successo (come sul web). Il campo userId (per conto di altri) NON è accettato:
// l'app registra solo per sé. Niente annullamento da parte del richiedente.
export const GET = withMobileAuth(async ({ user, impersonating }, req) => {
  const rawYear = new URL(req.url).searchParams.get("year");
  if (rawYear !== null && !/^\d{4}$/.test(rawYear)) throw new ValidationError("Anno non valido");
  const requests = await listOwnLeaveRequests(
    { id: user.id, role: user.role, employmentType: user.employmentType, impersonating },
    { year: rawYear === null ? undefined : Number(rawYear) }
  );
  return { requests };
});

export const POST = withMobileAuth(async ({ user, impersonating }, req) => {
  const body = await readJsonObject(req);
  const { request, notify } = await createLeaveRequest(
    { id: user.id, role: user.role, employmentType: user.employmentType, impersonating },
    {
      type: body.type,
      startDate: body.startDate,
      endDate: body.endDate,
      startTime: body.startTime,
      endTime: body.endTime,
      note: body.note,
      recoveryCreditId: body.recoveryCreditId,
      unit: body.unit,
    }
  );
  revalidatePath("/richieste");
  revalidatePath("/panoramica");
  revalidatePath("/team");
  revalidatePath("/");
  after(notify);
  return Response.json({ request }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
});
