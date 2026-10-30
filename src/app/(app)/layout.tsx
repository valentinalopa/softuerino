import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/session";
import { managedDepartmentNames } from "@/lib/departments";
import { can, peopleWhere } from "@/lib/permissions";
import { hasLicenseAccess } from "@/lib/licenses/access";
import { ssoAccountUrl } from "@/lib/auth/oidc";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar, MobileTopBar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/Toaster";
import { ImpersonationBanner } from "@/components/impersonation/ImpersonationBanner";
import { HOME_PATH, isAdminRole, type Role } from "@/lib/constants";

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
  // scheda Da approvare di /richieste: tutte quelle in attesa, anche le proprie).
  const teamPendingCount =
    isAdminRole(user.role)
      ? await prisma.leaveRequest.count({
          where: { status: "pending" },
        })
      : 0;

  // Reparti di cui è responsabile: simbolo nel menu e, secondo i permessi
  // del reparto, licenze e l'elenco di Persone.
  const managed = (await managedDepartmentNames([user.id])).get(user.id) ?? [];
  // Voci del menu secondo i permessi (Ruoli e permessi). Gli admin hanno già
  // Persone e Clienti in Azienda.
  const isAdmin = isAdminRole(user.role);
  const [approve, addClients, showLicenses] = await Promise.all([
    can(user, "approvare"),
    can(user, "clienti"),
    hasLicenseAccess(user),
  ]);
  // Richieste in attesa che può approvare.
  const repartoPendingCount =
    !isAdmin && approve
      ? await prisma.leaveRequest.count({ where: { status: "pending", user: await peopleWhere(user, "approvare") } })
      : 0;

  // Sidebar aperta o compressa: la ricorda il cookie del SidebarProvider di
  // shadcn, letto qui così la pagina arriva già nello stato giusto.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar
          currentUser={{
            name: user.name,
            email: user.email,
            role: user.role as Role,
            managedDepartments: managed,
          }}
          teamPendingCount={teamPendingCount}
          showLicenses={showLicenses}
          showClients={!isAdmin && addClients}
          repartoPendingCount={repartoPendingCount}
          ssoAccountUrl={ssoAccountUrl()}
        />
        {/* SidebarInset occupa tutto lo spazio lasciato dalla sidebar: quando
            si comprime, il contenuto si allarga. */}
        <SidebarInset className="min-w-0">
          {impersonating && <ImpersonationBanner userName={user.name} />}
          <MobileTopBar
            homeHref={HOME_PATH}
            pendingCount={teamPendingCount + repartoPendingCount}
          />
          <div className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 md:px-10">
            {/* Il tetto evita righe chilometriche sugli schermi enormi. */}
            <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  );
}
