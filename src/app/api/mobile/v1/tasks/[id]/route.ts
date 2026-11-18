import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { deleteTask, getTask, updateTask } from "@/lib/services/tasks";

const actorOf = ({ user, impersonating }: { user: { id: string; role: string; projectManager: boolean }; impersonating: boolean }) => ({
  id: user.id,
  role: user.role,
  projectManager: user.projectManager,
  impersonating,
});

export const GET = withMobileAuth<unknown, { id: string }>(async (ctx, _req, { params }) => {
  const { id } = await params;
  return { task: await getTask(actorOf(ctx), id) };
});

// Modifica completa (come il pannello della riga sul web): assegnatari compresi.
export const PUT = withMobileAuth<unknown, { id: string }>(async (ctx, req, { params }) => {
  const { id } = await params;
  const { task, notify } = await updateTask(actorOf(ctx), id, await readJsonObject(req));
  revalidatePath("/task");
  after(notify);
  return { task };
});

export const DELETE = withMobileAuth<Response, { id: string }>(async (ctx, _req, { params }) => {
  const { id } = await params;
  await deleteTask(actorOf(ctx), id);
  revalidatePath("/task");
  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
});
