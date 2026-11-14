import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { previewOwnLeaveRequest } from "@/lib/services/leave";

// Saldo dopo una richiesta non ancora inviata (come il riquadro del form web).
// Non scrive nulla: ammesso anche in impersonificazione.
export const POST = withMobileAuth(async ({ user }, req) => {
  const body = await readJsonObject(req);
  const preview = await previewOwnLeaveRequest(
    { id: user.id, role: user.role, employmentType: user.employmentType },
    {
      type: body.type,
      startDate: body.startDate,
      endDate: body.endDate,
      startTime: body.startTime,
      endTime: body.endTime,
      unit: body.unit,
    }
  );
  return { preview };
});
