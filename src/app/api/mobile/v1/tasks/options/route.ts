import { withMobileAuth } from "@/lib/mobile/http";
import { getTaskOptions } from "@/lib/services/tasks";

// Scelte del form task (clienti attivi, persone attive) e se l'archivio è visibile.
export const GET = withMobileAuth(async ({ user }) => {
  return getTaskOptions({ id: user.id, role: user.role, projectManager: user.projectManager });
});
