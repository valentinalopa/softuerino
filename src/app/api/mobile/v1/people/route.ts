import { withMobileAuth } from "@/lib/mobile/http";
import { listPeople } from "@/lib/services/people";

// Persone come /team: gli admin tutte con i saldi dell'anno; gli altri le persone
// dei propri reparti (DepartmentPeopleView), senza saldi. Senza permessi: elenco vuoto.
export const GET = withMobileAuth(async ({ user }) => {
  return { people: await listPeople({ id: user.id, role: user.role }) };
});
