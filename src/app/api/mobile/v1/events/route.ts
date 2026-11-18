import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { createEvent } from "@/lib/services/events";
import { afterEventWrite } from "@/lib/services/event-effects";

export const POST = withMobileAuth(async ({ user, impersonating }, req) => {
  const body = await readJsonObject(req);
  const { event, newParticipantIds } = await createEvent({ id: user.id, role: user.role, impersonating }, body);
  afterEventWrite(event.id, newParticipantIds, user.id);
  return Response.json(event, {
    status: 201,
    headers: { "Cache-Control": "private, no-store" },
  });
});
