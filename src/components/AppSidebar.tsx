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
  LogOut,
  UserRound,
  Settings,
  ListTodo,
  Inbox,
  Mail,
  RefreshCw,
  Cloud,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { ROLE_LABELS, homePathFor, isAdminRole, type Role } from "@/lib/constants";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Marchio } from "@/components/brand/Marchio";
import { cn, getInitials } from "@/lib/utils";
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

const ADMIN_LINKS: NavLink[] = [
  { href: "/panoramica", label: "Panoramica", icon: ChartColumn },
  { href: "/richieste-team", label: "Richieste del team", icon: Inbox },
  { href: "/team", label: "Team", icon: Users },
  { href: "/clienti", label: "Clienti", icon: Building2 },
];

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
}: {
  currentUser: { name: string; email: string; role: Role };
  // Richieste del team in attesa di approvazione (admin e super admin).
  teamPendingCount?: number;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  // La larghezza si anima solo dopo un clic dell'utente: al caricamento la
  // sidebar compare già nello stato salvato, senza animazione.
  const [animate, setAnimate] = useState(false);

  function toggle() {
    setAnimate(true);
    writeCollapsed(!collapsed);
  }

  const sections =
    isAdminRole(currentUser.role)
      ? [
          { label: null, links: COMMON_LINKS },
          { label: "Operatività", links: OPERATIVITA_LINKS },
          { label: "Amministrazione", links: ADMIN_LINKS },
          ...(currentUser.role === "super_admin"
            ? [{ label: "Sistema", links: SYSTEM_LINKS }]
            : []),
        ]
      : [
          { label: null, links: COMMON_LINKS },
          { label: "Operatività", links: OPERATIVITA_LINKS },
        ];

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-ds-slow ease-ds",
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
        <Link
          href={homePathFor(currentUser.role)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5",
            collapsed && "flex-none"
          )}
          title={isAdminRole(currentUser.role) ? "Panoramica" : "Dashboard"}
        >
          <Marchio className={collapsed ? "h-6" : "h-[26px]"} />
          {!collapsed && (
            <span className="truncate font-heading text-lg leading-7 font-semibold text-foreground">
              Softuerino
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Espandi" : "Comprimi"}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-ds hover:bg-subtle hover:text-foreground"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
        {sections.map((section, index) => (
          <div key={section.label ?? "common"} className="flex flex-col gap-1">
            {index > 0 && collapsed && (
              <div className="mx-2 mb-2 border-t border-sidebar-border" aria-hidden="true" />
            )}
            {section.label && !collapsed && (
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
              const badge = link.href === "/richieste-team" ? teamPendingCount : 0;
              if (link.external) {
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={collapsed ? `${link.label} (nuova scheda)` : undefined}
                    className={cn(NAV_ITEM, NAV_ITEM_IDLE, collapsed && "justify-center px-0")}
                  >
                    <Icon className="size-4.5 shrink-0" strokeWidth={1.5} />
                    {!collapsed && <span className="truncate">{link.label}</span>}
                    {!collapsed && (
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
                  title={collapsed ? link.label : undefined}
                  className={cn(
                    NAV_ITEM,
                    active ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE,
                    collapsed && "justify-center px-0"
                  )}
                >
                  <span className="relative flex shrink-0">
                    <Icon className="size-4.5" strokeWidth={1.5} />
                    {collapsed && badge > 0 && (
                      <span
                        className={`absolute -top-1 -right-1 size-2 rounded-full ${TONE_DOT.warning}`}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  {!collapsed && <span className="truncate">{link.label}</span>}
                  {!collapsed && badge > 0 && (
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
          collapsed && "mx-2"
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors duration-ds hover:bg-subtle",
              collapsed && "justify-center"
            )}
            title={collapsed ? currentUser.name : undefined}
          >
            <Avatar size="sm" className="shrink-0">
              <AvatarFallback>
                {getInitials(currentUser.name)}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <span className="min-w-0 flex-1 truncate">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {currentUser.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {ROLE_LABELS[currentUser.role]}
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
            <DropdownMenuItem render={<Link href="/profilo" />}>
              <UserRound />
              Profilo
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/impostazioni" />}>
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
    </aside>
  );
}
