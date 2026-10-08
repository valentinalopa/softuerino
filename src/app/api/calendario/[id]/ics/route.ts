import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/session";
import { eventToIcs } from "@/lib/ics";

// "Aggiungi al calendario": l'evento come file .ics, per chi ha accesso al
// calendario di Softuerino (tutti gli utenti attivi). In linea: su iPhone e
// Mac si apre subito la scheda "Aggiungi al calendario".
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return new Response("Accesso richiesto", { status: 401 });

  const { id } = await params;
  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    select: { id: true, title: true, startAt: true, endAt: true, location: true, description: true },
  });
  if (!event) return new Response("Evento non trovato", { status: 404 });

  const name = event.title.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "evento";
  return new Response(eventToIcs(event), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${name}.ics"`,
      "Cache-Control": "no-store, private",
    },
  });
}
