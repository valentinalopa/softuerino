import { revalidatePath } from "next/cache";
import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { revealLicenseSecret } from "@/lib/services/licenses";

// Segreto in chiaro: mai in cache (Cache-Control e Pragma anche sugli errori,
// vedi BASE_HEADERS in lib/mobile/http.ts). Il valore non va mai nei log.
export const POST = withMobileAuth<Response, { id: string }>(async ({ user, impersonating }, req, { params }) => {
  const { id } = await params;
  const result = await revealLicenseSecret({ id: user.id, role: user.role, impersonating }, id, await readJsonObject(req));
  revalidatePath("/utilita/licenze");
  revalidatePath(`/utilita/licenze/${id}`);
  return Response.json(result, { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } });
});
