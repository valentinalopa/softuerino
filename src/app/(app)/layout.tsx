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

  // Contatore in sidebar delle richieste da approvare (stesso criterio della
  // pagina /richieste-team: quelle degli altri membri).
  const teamPendingCount =
    user.role === "super_admin"
      ? await prisma.leaveRequest.count({
          where: { userId: { not: user.id }, status: "pending" },
        })
      : 0;

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        currentUser={{
          name: user.name,
          email: user.email,
          role: user.role as Role,
        }}
        teamPendingCount={teamPendingCount}
      />
      <main className="min-w-0 flex-1 overflow-x-hidden px-6 py-8 md:px-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
