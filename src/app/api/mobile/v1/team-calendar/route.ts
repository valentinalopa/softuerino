import { withMobileAuth } from "@/lib/mobile/http";
import { listTeamCalendar, parseCalendarRange } from "@/lib/services/calendar";

// Chi c'è e chi è assente (elemento #320). Il motivo dell'assenza lo decide il
// service in base al ruolo; nessun 403 al membro.
export const GET = withMobileAuth(async ({ user }, req) => {
  const q = new URL(req.url).searchParams;
  const range = parseCalendarRange(q.get("from"), q.get("to"));
  return listTeamCalendar({ id: user.id, role: user.role }, range);
});
