import { withMobileAuth } from "@/lib/mobile/http";
import { upcomingEvents } from "@/lib/services/calendar";

// Widget: prossimi eventi (7 giorni), solo id, title, type, startAt, endAt.
export const GET = withMobileAuth(async ({ user }) => {
  return { events: await upcomingEvents({ id: user.id, role: user.role }) };
});
