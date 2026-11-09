import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { getEvent } from "@/lib/services/calendar";
import { updateEvent, deleteEvent } from "@/lib/services/events";
import { afterEventWrite, afterEventDelete } from "@/lib/services/event-effects";

type P = { id: string };

export const GET = withMobileAuth<unknown, P>(async ({ user }, _req, route) => {
  const { id } = await route.params;
  return getEvent({ id: user.id, role: user.role }, id);
});

export const PATCH = withMobileAuth<unknown, P>(async ({ user, impersonating }, req, route) => {
  const { id } = await route.params;
  const body = await readJsonObject(req);
  const { event, newParticipantIds } = await updateEvent({ id: user.id, role: user.role, impersonating }, id, body);
  afterEventWrite(event.id, newParticipantIds, user.id);
  return event;
});

export const DELETE = withMobileAuth<unknown, P>(async ({ user, impersonating }, _req, route) => {
  const { id } = await route.params;
  await deleteEvent({ id: user.id, role: user.role, impersonating }, id);
  afterEventDelete();
  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
});
