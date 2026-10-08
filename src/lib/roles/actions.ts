"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import { MANAGER_CAPS, type ManagerCap } from "@/lib/constants";

type ActionResult = { error: string } | undefined;

// Amministrazione → Ruoli e permessi: solo super admin (requireSuperAdmin
// blocca anche "Vedi come", dove l'utente effettivo è un membro).

// Cosa possono fare i responsabili di un reparto.
export async function updateDepartmentPermissions(departmentId: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const caps = formData
    .getAll("caps")
    .map(String)
    .filter((c): c is ManagerCap => (MANAGER_CAPS as readonly string[]).includes(c));
  const { count } = await prisma.department.updateMany({
    where: { id: departmentId },
    data: { managerPermissions: MANAGER_CAPS.filter((c) => caps.includes(c)).join(",") },
  });
  if (count === 0) return { error: "Reparto non trovato" };
  // Il menu (Licenze, Il mio reparto) dipende da questi permessi.
  revalidatePath("/", "layout");
}

// Responsabili ferie: chi riceve un'email per ogni nuova richiesta.
export async function updateLeaveNotify(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const ids = formData.getAll("userId").map(String);
  await prisma.$transaction([
    prisma.user.updateMany({ where: { id: { notIn: ids } }, data: { leaveNotify: false } }),
    prisma.user.updateMany({ where: { id: { in: ids }, active: true }, data: { leaveNotify: true } }),
  ]);
  revalidatePath("/ruoli");
  return undefined;
}
