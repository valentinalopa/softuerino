import { withMobileAuth } from "@/lib/mobile/http";
import { getLicense } from "@/lib/services/licenses";

export const GET = withMobileAuth<unknown, { id: string }>(async ({ user, impersonating }, _req, { params }) => {
  const { id } = await params;
  return { license: await getLicense({ id: user.id, role: user.role, impersonating }, id) };
});
