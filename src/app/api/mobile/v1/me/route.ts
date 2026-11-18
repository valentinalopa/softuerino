import { withMobileAuth } from "@/lib/mobile/http";
import { prisma } from "@/lib/prisma";
import { leaveTypesFor } from "@/lib/constants";
import { archiveScope, canViewTaskArchive } from "@/lib/task-archive";
import { canCreateClient } from "@/lib/services/clients";
import { hasLicenseAccess } from "@/lib/licenses/access";

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
  // Cosa può usare l'app (stessi controlli dei service, non duplicati nell'app).
  const [clients, licensesView] = await Promise.all([
    canCreateClient({ id: user.id, role: user.role }),
    hasLicenseAccess({ id: user.id, role: user.role }),
  ]);
  const taskArchive = canViewTaskArchive(
    archiveScope({ id: user.id, role: user.role, projectManager: user.projectManager }, managed.map((m) => m.department.id))
  );
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    // Rapporto di lavoro e tipi di richiesta ammessi (dipendente / partita IVA).
    employmentType: user.employmentType,
    leaveTypes: leaveTypesFor(user.employmentType),
    hasSuperAdminRole,
    superAdminActive,
    managedDepartments: managed.map((m) => m.department),
    projectManager: user.projectManager,
    // Reparti a cui fa capo (reports_to di Keycloak), nomi.
    reportsTo: user.reportsTo.split(",").map((n) => n.trim()).filter(Boolean),
    // clientsView e clientsCreate coincidono: stesso permesso (services/clients.ts).
    capabilities: { taskArchive, clientsView: clients, clientsCreate: clients, licensesView },
  };
});
