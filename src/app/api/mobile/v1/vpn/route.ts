import { withMobileAuth } from "@/lib/mobile/http";
import { listVpnProfiles } from "@/lib/services/vpn";

// Profili VPN (nome, note, nome file): come la scheda VPN di Security sul web.
// Solo consultazione e download; la gestione resta ai super admin sul web.
export const GET = withMobileAuth(async () => {
  return { profiles: await listVpnProfiles() };
});
