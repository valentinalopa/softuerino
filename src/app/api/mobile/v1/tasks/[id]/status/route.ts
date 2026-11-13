import { revalidatePath } from "next/cache";
import { withMobileAuth, readJsonObject } from "@/lib/mobile/http";
import { setTaskStatus } from "@/lib/services/tasks";

// Cambio di stato (scorrimento nella lista dell'app). Corpo: { status }.
export const POST = withMobileAuth<unknown, { id: string }>(async ({ user, impersonating }, req, { params }) => {
  const { id } = await params;
  const body = await readJsonObject(req);
  const task = await setTaskStatus(
    { id: user.id, role: user.role, projectManager: user.projectManager, impersonating },
    id,
    body.status
  );
  revalidatePath("/task");
  return { task };
});
