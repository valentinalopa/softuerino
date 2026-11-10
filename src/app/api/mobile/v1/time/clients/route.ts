import { withMobileAuth } from "@/lib/mobile/http";
import { listLoggableClients } from "@/lib/services/time";

// Clienti su cui la persona può registrare ore.
export const GET = withMobileAuth(async ({ user }) => ({
  clients: await listLoggableClients({ id: user.id, role: user.role }),
}));
