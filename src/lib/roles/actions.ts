"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import { generalRules } from "@/lib/permissions";
import {
  CAPABILITY_KEYS,
  DEPARTMENT_ROLES,
  PERMISSION_ROLES,
  defaultRules,
  normalizeRules,
  type PermissionRole,
} from "@/lib/permission-rules";

type ActionResult = { error: string } | undefined;

// Amministrazione → Ruoli e permessi: solo super admin (requireSuperAdmin
// blocca anche "Vedi come", dove l'utente effettivo è un membro).

// Campi "rule:<permesso>:<ruolo>" del form → oggetto regole (non validato).
function rulesFromForm(formData: FormData, roles: readonly PermissionRole[]) {
  const raw: Record<string, Record<string, string>> = {};
  for (const cap of CAPABILITY_KEYS) {
    raw[cap] = {};
    for (const role of roles) {
      const value = formData.get(`rule:${cap}:${role}`);
      if (typeof value === "string") raw[cap][role] = value;
    }
  }
  return raw;
}

// Impostazioni generali (per ruolo): valgono per tutti i reparti non personalizzati.
export async function updateGeneralRules(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const rules = normalizeRules(rulesFromForm(formData, PERMISSION_ROLES), await generalRules());
  await prisma.permissionSettings.upsert({
    where: { id: 1 },
    create: { id: 1, rules: JSON.stringify(rules) },
    update: { rules: JSON.stringify(rules) },
  });
  // Il menu dipende dai permessi.
  revalidatePath("/", "layout");
  return undefined;
}

// Un reparto: impostazioni generali (mode "general") o personalizzate per i
// suoi membri e responsabili.
export async function updateDepartmentRules(departmentId: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  let permissions: string | null = null;
  if (formData.get("mode") === "custom") {
    const rules = normalizeRules(rulesFromForm(formData, DEPARTMENT_ROLES), await generalRules(), DEPARTMENT_ROLES);
    const stored = Object.fromEntries(
      CAPABILITY_KEYS.map((cap) => [cap, Object.fromEntries(DEPARTMENT_ROLES.map((r) => [r, rules[cap][r]]))])
    );
    permissions = JSON.stringify(stored);
  }
  const { count } = await prisma.department.updateMany({ where: { id: departmentId }, data: { permissions } });
  if (count === 0) return { error: "Reparto non trovato" };
  revalidatePath("/", "layout");
  return undefined;
}

// Ripristina i permessi predefiniti di Softuerino (impostazioni generali).
export async function resetGeneralRules(): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.permissionSettings.upsert({
    where: { id: 1 },
    create: { id: 1, rules: JSON.stringify(defaultRules()) },
    update: { rules: JSON.stringify(defaultRules()) },
  });
  revalidatePath("/", "layout");
  return undefined;
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
