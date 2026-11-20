import { withMobileAuth } from "@/lib/mobile/http";
import { getPerson } from "@/lib/services/people";

type P = { id: string };

// Dettaglio di una persona, stesse condizioni dell'elenco. Non visibile → 404
// (non si rivela che esiste).
export const GET = withMobileAuth<unknown, P>(async ({ user }, _req, route) => {
  const { id } = await route.params;
  return { person: await getPerson({ id: user.id, role: user.role }, id) };
});
