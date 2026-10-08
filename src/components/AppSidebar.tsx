"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Timer,
  Users,
  Building2,
  ChartColumn,
  PanelLeft,
  Menu,
  LogOut,
  UserRound,
  Settings,
  ListTodo,
  Inbox,
  Mail,
  RefreshCw,
  Cloud,
  ExternalLink,
  KeyRound,
  Network,
  UserStar,
  SlidersHorizontal,
  ShieldCheck,
  EarthLock,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { homePathFor, isAdminRole, type Role } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Marchio } from "@/components/brand/Marchio";
import { LevelAvatar, levelSummary } from "@/components/team/UserLevel";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { TONE_DOT, TONE_SOFT } from "@/lib/tones";

// external: sito esterno (es. il cloud aziendale), aperto in una nuova scheda.
type NavLink = { href: string; label: string; icon: LucideIcon; external?: boolean };

const COMMON_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/richieste", label: "Giorni off", icon: ClipboardCheck },
  { href: "/presenze", label: "Presenze", icon: Clock3 },
  { href: "/ore", label: "Log ore", icon: Timer },
];

const OPERATIVITA_LINKS: NavLink[] = [
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/task", label: "Task", icon: ListTodo },
  { href: "https://cloud.colibrivision.it", label: "Cloud", icon: Cloud, external: true },
];

// Licenze: manager di reparto (organigramma Keycloak), admin e super admin.
const LICENSES_LINK: NavLink = { href: "/utilita/licenze", label: "Licenze e abbonamenti", icon: KeyRound };
// Il mio reparto: per chi ha permessi sulle persone (Ruoli e permessi).
const REPARTO_LINK: NavLink = { href: "/reparto", label: "Il mio reparto", icon: UserStar };
// VPN e organigramma: per tutti.
const VPN_LINK: NavLink = { href: "/utilita/vpn", label: "VPN", icon: EarthLock };
const ORG_LINK: NavLink = { href: "/organigramma", label: "Organigramma", icon: Network };

const ADMIN_LINKS: NavLink[] = [
  { href: "/panoramica", label: "Panoramica", icon: ChartColumn },
  { href: "/richieste-team", label: "Richieste del team", icon: Inbox },
  { href: "/team", label: "Team", icon: Users },
  { href: "/clienti", label: "Clienti", icon: Building2 },
];

// Ruoli e permessi: solo super admin, ma sta con l'amministrazione.
const ROLES_LINK: NavLink = { href: "/ruoli", label: "Ruoli e permessi", icon: SlidersHorizontal };

// Operazioni di sistema: solo super admin.
const SYSTEM_LINKS: NavLink[] = [
  { href: "/impostazioni/aggiornamenti", label: "Aggiornamenti", icon: RefreshCw },
  { href: "/impostazioni/email", label: "Email", icon: Mail },
];

// Voce di navigazione — DS Sidebar: 14px, padding 10px, raggio 10px.
const NAV_ITEM =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm transition-colors duration-ds ease-ds";
const NAV_ITEM_ACTIVE =
  "bg-sidebar-accent font-semibold text-sidebar-accent-foreground";
const NAV_ITEM_IDLE =
  "font-medium text-sidebar-foreground hover:bg-subtle hover:text-foreground";

const STORAGE_KEY = "softuerino:sidebar-collapsed";
// L'evento "storage" arriva solo dalle altre schede: per la scheda corrente
// ne emettiamo uno nostro quando la preferenza cambia.
const CHANGE_EVENT = "softuerino:sidebar-collapsed-change";

// Preferenza "sidebar chiusa" letta dal localStorage come store esterno: il
// server (che non lo vede) parte da aperta, il browser legge subito il valore
// salvato, senza setState dentro un effect.
function subscribeCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readCollapsed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // storage non disponibile (es. navigazione privata)
  }
}

function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Senza storage la preferenza non si ricorda, ma la sidebar funziona.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function AppSidebar({
  currentUser,
  teamPendingCount = 0,
  showLicenses = false,
  showReparto = false,
  showClients = false,
  repartoPendingCount = 0,
  ssoAccountUrl = null,
}: {
  // managedDepartments: reparti di cui è responsabile (Keycloak).
  currentUser: { name: string; email: string; role: Role; managedDepartments?: string[] };
  // Richieste del team in attesa di approvazione (admin e super admin).
  teamPendingCount?: number;
  // Licenze e abbonamenti: responsabile con il permesso, admin o super admin.
  showLicenses?: boolean;
  // "Il mio reparto": chi (non admin) ha permessi sulle persone.
  showReparto?: boolean;
  // Clienti in Utilità per chi (non admin) può aggiungerli.
  showClients?: boolean;
  // Richieste del reparto in attesa, se il responsabile può approvarle.
  repartoPendingCount?: number;
  // Account SSO (console di Keycloak), per tutti; null senza SSO.
  ssoAccountUrl?: string | null;
}) {
  const pathname = usePathname();
  const managed = currentUser.managedDepartments ?? [];
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  // La larghezza si anima solo dopo un clic dell'utente: al caricamento la
  // sidebar compare già nello stato salvato, senza animazione.
  const [animate, setAnimate] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  function toggle() {
    setAnimate(true);
    writeCollapsed(!collapsed);
  }

  const utilityLinks: NavLink[] = [
    ...(showReparto ? [REPARTO_LINK] : []),
    ...(showLicenses ? [LICENSES_LINK] : []),
    ...(showClients ? [{ href: "/clienti", label: "Clienti", icon: Building2 }] : []),
    ORG_LINK,
    VPN_LINK,
    ...(ssoAccountUrl ? [{ href: ssoAccountUrl, label: "Account SSO", icon: ShieldCheck, external: true }] : []),
  ];
  const sections = [
    { label: null, links: COMMON_LINKS },
    { label: "Operatività", links: OPERATIVITA_LINKS },
    ...(utilityLinks.length > 0 ? [{ label: "Utilità", links: utilityLinks }] : []),
    ...(isAdminRole(currentUser.role)
      ? [
          {
            label: "Amministrazione",
            links: currentUser.role === "super_admin" ? [...ADMIN_LINKS, ROLES_LINK] : ADMIN_LINKS,
          },
        ]
      : []),
    ...(currentUser.role === "super_admin" ? [{ label: "Sistema", links: SYSTEM_LINKS }] : []),
  ];

  // Navigazione e menu utente: uguali nella sidebar (desktop) e nel menu a
  // scomparsa (mobile, sempre esteso).
  function renderBody(isCollapsed: boolean, onNavigate?: () => void) {
    return (
      <>
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          {sections.map((section, index) => (
            <div key={section.label ?? "common"} className="flex flex-col gap-1">
              {index > 0 && isCollapsed && (
                <div className="mx-2 mb-2 border-t border-sidebar-border" aria-hidden="true" />
              )}
              {section.label && !isCollapsed && (
                <div className="px-2 pb-1 text-xs leading-4 font-semibold tracking-label text-muted-foreground uppercase">
                  {section.label}
                </div>
              )}
              {section.links.map((link) => {
                // Confronto per segmento: "/richieste" non deve accendersi su
                // "/richieste-team".
                const active =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname === link.href || pathname.startsWith(`${link.href}/`);
                const Icon = link.icon;
                const badge =
                link.href === "/richieste-team"
                  ? teamPendingCount
                  : link.href === "/reparto"
                    ? repartoPendingCount
                    : 0;
                if (link.external) {
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={onNavigate}
                      title={isCollapsed ? `${link.label} (nuova scheda)` : undefined}
                      className={cn(NAV_ITEM, NAV_ITEM_IDLE, isCollapsed && "justify-center px-0")}
                    >
                      <Icon className="size-4.5 shrink-0" strokeWidth={1.5} />
                      {!isCollapsed && <span className="truncate">{link.label}</span>}
                      {!isCollapsed && (
                        <ExternalLink
                          className="ml-auto size-3.5 shrink-0 text-muted-foreground"
                          aria-label="si apre in una nuova scheda"
                        />
                      )}
                    </a>
                  );
                }
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onNavigate}
                    title={isCollapsed ? link.label : undefined}
                    className={cn(
                      NAV_ITEM,
                      active ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE,
                      isCollapsed && "justify-center px-0"
                    )}
                  >
                    <span className="relative flex shrink-0">
                      <Icon className="size-4.5" strokeWidth={1.5} />
                      {isCollapsed && badge > 0 && (
                        <span
                          className={`absolute -top-1 -right-1 size-2 rounded-full ${TONE_DOT.warning}`}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    {!isCollapsed && <span className="truncate">{link.label}</span>}
                    {!isCollapsed && badge > 0 && (
                      <span
                        className={`ml-auto rounded-full px-1.5 text-xs leading-5 font-semibold ${TONE_SOFT.warning}`}
                        aria-label={`${badge} in attesa`}
                      >
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div
          className={cn(
            "mx-4 border-t border-sidebar-border py-4",
            isCollapsed && "mx-2"
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors duration-ds hover:bg-subtle",
                isCollapsed && "justify-center"
              )}
              title={isCollapsed ? currentUser.name : undefined}
            >
              <LevelAvatar name={currentUser.name} role={currentUser.role} departments={managed} />
              {!isCollapsed && (
                <span className="min-w-0 flex-1 truncate">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {currentUser.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {levelSummary(currentUser.role, managed)}
                  </span>
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <div className="px-1.5 py-1.5">
                <p className="truncate text-sm font-medium text-foreground">
                  {currentUser.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {currentUser.email}
                </p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/profilo" onClick={onNavigate} />}>
                <UserRound />
                Profilo
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/impostazioni" onClick={onNavigate} />}>
                <Settings />
                Impostazioni
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action={logoutAction} className="contents">
                <DropdownMenuItem
                  nativeButton
                  variant="destructive"
                  render={<button type="submit" className="w-full" />}
                >
                  <LogOut />
                  Esci
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </>
    );
  }

  const brand = (isCollapsed: boolean, onNavigate?: () => void) => (
    <Link
      href={homePathFor(currentUser.role)}
      onClick={onNavigate}
      className={cn("flex min-w-0 flex-1 items-center gap-2.5", isCollapsed && "flex-none")}
      title={isAdminRole(currentUser.role) ? "Panoramica" : "Dashboard"}
    >
      <Marchio className={isCollapsed ? "h-6" : "h-[26px]"} />
      {!isCollapsed && (
        <span className="truncate font-heading text-lg leading-7 font-semibold text-foreground">
          Softuerino
        </span>
      )}
    </Link>
  );

  return (
    <>
      {/* Mobile: barra in alto con il menu a scomparsa. */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            render={
              <button
                type="button"
                aria-label="Apri il menu"
                className="relative flex size-10 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors duration-ds hover:bg-subtle"
              />
            }
          >
            <Menu className="size-5" />
            {teamPendingCount + repartoPendingCount > 0 && (
              <span className={`absolute top-2 right-2 size-2 rounded-full ${TONE_DOT.warning}`} aria-hidden="true" />
            )}
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] max-w-[85vw] bg-sidebar text-sidebar-foreground">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex h-14 shrink-0 items-center px-5 pr-14">{brand(false, closeMobile)}</div>
            {renderBody(false, closeMobile)}
          </SheetContent>
        </Sheet>
        {brand(false)}
      </header>

      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-ds-slow ease-ds md:flex",
          collapsed ? "w-[72px]" : "w-[248px]",
          !animate && "transition-none"
        )}
      >
        <div
          className={cn(
            "flex h-[72px] shrink-0 items-center gap-2.5 px-6",
            collapsed && "flex-col justify-center gap-1 px-0"
          )}
        >
          {brand(collapsed)}
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? "Espandi" : "Comprimi"}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-ds hover:bg-subtle hover:text-foreground"
          >
            <PanelLeft className="size-4" />
          </button>
        </div>
        {renderBody(collapsed)}
      </aside>
    </>
  );
}
