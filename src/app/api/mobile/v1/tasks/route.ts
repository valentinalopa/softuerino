import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { createTask, listTasks, mineByDefault, type TaskView } from "@/lib/services/tasks";
import { ValidationError } from "@/lib/services/errors";

const VIEWS: TaskView[] = ["active", "done", "archive"];

// Task. GET ?view=active|done|archive (default active), &user=me|all|<id>, &clientId=.
// Senza `user` valgono i predefiniti del web: i membri partono dai propri task,
// gli admin da tutti; l'archivio parte da tutti. L'archivio è per admin, project
// manager e responsabili (403 per gli altri). Il filtro `user` non allarga mai
// l'ambito: lo stabilisce il service.
export const GET = withMobileAuth(async ({ user }, req) => {
  const params = new URL(req.url).searchParams;
  const rawView = params.get("view") ?? "active";
  if (!VIEWS.includes(rawView as TaskView)) throw new ValidationError("Vista non valida");
  const view = rawView as TaskView;
  const actor = { id: user.id, role: user.role, projectManager: user.projectManager };

  const userParam = params.get("user");
  const userId =
    userParam === "all" ? undefined : userParam === "me" ? user.id : (userParam ?? (mineByDefault(actor, view) ? user.id : undefined));
  const tasks = await listTasks(actor, { view, userId, clientId: params.get("clientId") || undefined });
  return { tasks };
});

export const POST = withMobileAuth(async ({ user, impersonating }, req) => {
  const body = await readJsonObject(req);
  const { task, notify } = await createTask(
    { id: user.id, role: user.role, projectManager: user.projectManager, impersonating },
    body
  );
  revalidatePath("/task");
  after(notify);
  return Response.json({ task }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
});
