import { withMobileAuth } from "@/lib/mobile/http";
import { prisma } from "@/lib/prisma";

// Profilo di chi ha fatto il login nell'app: solo i campi che servono alla UI.
// role è il ruolo effettivo: un super admin fuori dalla rete interna fidata
// risulta "admin" (elemento #314). hasSuperAdminRole dice se nel database è super admin,
// superAdminActive se in questa richiesta i suoi poteri sono attivi (elemento
// #310): per l'indicatore "super admin capabilities ok" dell'app.
export const GET = withMobileAuth(async ({ user, hasSuperAdminRole, superAdminActive }) => {
  const managed = await prisma.userDepartment.findMany({
    where: { userId: user.id, isManager: true },
    select: { department: { select: { id: true, name: true } } },
    orderBy: { department: { name: "asc" } },
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    hasSuperAdminRole,
    superAdminActive,
    managedDepartments: managed.map((m) => m.department),
  };
});
