import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/session";
import { managedDepartmentIds } from "@/lib/departments";
import { ssoAccountUrl } from "@/lib/auth/oidc";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/AppSidebar";
import { ImpersonationBanner } from "@/components/impersonation/ImpersonationBanner";
import { isAdminRole, type Role } from "@/lib/constants";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Durante un'impersonificazione `user` è il membro impersonato: sidebar e
  // pagine si comportano come per lui.
  const context = await getAuthContext();
  if (!context) {
    redirect("/login");
  }
  const { user, impersonating } = context;

  // Contatore in sidebar delle richieste da approvare (stesso criterio della
  // pagina /richieste-team: tutte quelle in attesa, anche le proprie).
  const teamPendingCount =
    isAdminRole(user.role)
      ? await prisma.leaveRequest.count({
          where: { status: "pending" },
        })
      : 0;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar
        currentUser={{
          name: user.name,
          email: user.email,
          role: user.role as Role,
        }}
        teamPendingCount={teamPendingCount}
        showLicenses={isAdminRole(user.role) || (await managedDepartmentIds(user.id)).length > 0}
        ssoAccountUrl={ssoAccountUrl()}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {impersonating && <ImpersonationBanner userName={user.name} />}
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 md:px-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
