import { withMobileAuth } from "@/lib/mobile/http";
import { downloadVpnConfig } from "@/lib/services/vpn";

// Scarica il .ovpn (come /api/vpn/[id]/config): registra il download in
// VpnDownload; 403 in "vedi come"; 404 se il profilo non esiste o è senza file.
export const GET = withMobileAuth<Response, { id: string }>(async ({ user, impersonating }, _req, route) => {
  const { id } = await route.params;
  const { fileName, content } = await downloadVpnConfig({ id: user.id, impersonating: Boolean(impersonating) }, id);
  return new Response(content, {
    headers: {
      "Content-Type": "application/x-openvpn-profile",
      "Content-Disposition": `attachment; filename="${fileName.replace(/["\\\r\n]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
