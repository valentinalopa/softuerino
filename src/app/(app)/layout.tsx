import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { AppSidebar } from "@/components/AppSidebar";
import type { Role } from "@/lib/constants";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // Sottovoci PED in sidebar: i clienti "comunicazione" attivi.
  const pedClients = await prisma.client.findMany({
    where: { active: true, categories: { contains: "comunicazione" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        currentUser={{
          name: user.name,
          email: user.email,
          role: user.role as Role,
        }}
        pedClients={pedClients}
      />
      <main className="min-w-0 flex-1 overflow-x-hidden px-6 py-8 md:px-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
