import { withMobileAuth } from "@/lib/mobile/http";
import { listLicenses } from "@/lib/services/licenses";

// Elenco licenze visibili all'utente, sempre mascherate.
export const GET = withMobileAuth(async ({ user, impersonating }) => {
  return { licenses: await listLicenses({ id: user.id, role: user.role, impersonating }) };
});
