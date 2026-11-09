import { withMobileAuth } from "@/lib/mobile/http";
import { listCalendar, parseCalendarRange } from "@/lib/services/calendar";

// Calendario dell'app: eventi e SOLO le proprie assenze/presenze, per un periodo
// di al massimo 62 giorni (?from=AAAA-MM-GG&to=AAAA-MM-GG). Nessun permesso
// nuovo: i controlli stanno nel service.
export const GET = withMobileAuth(async ({ user }, req) => {
  const q = new URL(req.url).searchParams;
  const range = parseCalendarRange(q.get("from"), q.get("to"));
  return listCalendar({ id: user.id, role: user.role }, range);
});
