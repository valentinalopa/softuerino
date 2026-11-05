import { withMobileAuth } from "@/lib/mobile/http";
import { prisma } from "@/lib/prisma";

// Profilo di chi ha fatto il login nell'app: solo i campi che servono alla UI.
export const GET = withMobileAuth(async ({ user }) => {
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
    managedDepartments: managed.map((m) => m.department),
  };
});
