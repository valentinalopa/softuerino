import { withMobileAuth } from "@/lib/mobile/http";
import { getOwnLeaveRequest } from "@/lib/services/leave";

type P = { id: string };

// Una richiesta propria. Quelle di altri rispondono 404.
export const GET = withMobileAuth<unknown, P>(async ({ user, impersonating }, _req, route) => {
  const { id } = await route.params;
  const request = await getOwnLeaveRequest(
    { id: user.id, role: user.role, employmentType: user.employmentType, impersonating },
    id
  );
  return { request };
});
