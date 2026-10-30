"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Timer,
  Users,
  Building2,
  ChartColumn,
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
  ChevronDown,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { TONE_DOT, TONE_SOFT } from "@/lib/tones";

// external: sito esterno (es. il cloud aziendale), aperto in una nuova scheda.
type NavLink = { href: string; label: string; icon: LucideIcon; external?: boolean };

// Menu per frequenza d'uso (vedi la proposta "nuova architettura UX"):
// in alto il quotidiano, poi l'azienda, poi strumenti e accessi. La
// configurazione rara sta nel menu utente, in basso.
const DAILY_LINKS: NavLink[] = [
  { href: "/", label: "Oggi", icon: LayoutDashboard },
  { href: "/ore", label: "Ore", icon: Timer },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/presenze", label: "Presenze", icon: Clock3 },
  { href: "/richieste", label: "Richieste", icon: ClipboardCheck },
  { href: "/task", label: "Task", icon: ListTodo },
];

// Azienda, admin e super admin: approvazioni, persone, clienti, report.
const ADMIN_COMPANY_LINKS: NavLink[] = [
  { href: "/richieste-team", label: "Richieste del team", icon: Inbox },
  { href: "/team", label: "Persone", icon: Users },
  { href: "/clienti", label: "Clienti", icon: Building2 },
  { href: "/panoramica", label: "Report", icon: ChartColumn },
];
// Il mio reparto: per chi (non admin) ha permessi sulle persone.
const REPARTO_LINK: NavLink = { href: "/reparto", label: "Il mio reparto", icon: UserStar };
const CLIENTS_LINK: NavLink = { href: "/clienti", label: "Clienti", icon: Building2 };
const ORG_LINK: NavLink = { href: "/organigramma", label: "Organigramma", icon: Network };

// Risorse: strumenti e accessi aziendali. Licenze: responsabili con il
// permesso, admin e super admin; il resto per tutti.
const LICENSES_LINK: NavLink = { href: "/utilita/licenze", label: "Licenze e abbonamenti", icon: KeyRound };
const VPN_LINK: NavLink = { href: "/utilita/vpn", label: "VPN", icon: EarthLock };
const CLOUD_LINK: NavLink = { href: "https://cloud.colibrivision.it", label: "Cloud", icon: Cloud, external: true };

// Menu utente, solo super admin: permessi e operazioni di sistema.
const SUPER_ADMIN_MENU_LINKS: NavLink[] = [
  { href: "/ruoli", label: "Ruoli e permessi", icon: SlidersHorizontal },
  { href: "/impostazioni/aggiornamenti", label: "Aggiornamenti", icon: RefreshCw },
  { href: "/impostazioni/email", label: "Email", icon: Mail },
];

// Sezioni aperte o chiuse a mano (titolo → aperta), stesso schema della
// preferenza qui sopra. Senza una scelta salvata la sezione è chiusa
// (tranne "Ogni giorno", vedi isSectionOpen).
const SECTIONS_KEY = "softuerino:sidebar-sections";
const SECTIONS_EVENT = "softuerino:sidebar-sections-change";

function subscribeSections(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SECTIONS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SECTIONS_EVENT, onChange);
  };
}

// Stringa grezza: useSyncExternalStore vuole uno snapshot stabile.
function readSections() {
  try {
    return window.localStorage.getItem(SECTIONS_KEY) ?? "";
  } catch {
    return "";
  }
}

function parseSections(raw: string): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeSections(value: Record<string, boolean>) {
  try {
    window.localStorage.setItem(SECTIONS_KEY, JSON.stringify(value));
  } catch {
    // Senza storage le sezioni ripartono chiuse, ma si aprono lo stesso.
  }
  window.dispatchEvent(new Event(SECTIONS_EVENT));
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
  // Clienti in Azienda per chi (non admin) può aggiungerli.
  showClients?: boolean;
  // Richieste del reparto in attesa, se il responsabile può approvarle.
  repartoPendingCount?: number;
  // Account SSO (console di Keycloak), per tutti; null senza SSO.
  ssoAccountUrl?: string | null;
}) {
  const pathname = usePathname();
  const managed = currentUser.managedDepartments ?? [];
  // Stato aperta/compressa e menu mobile li gestisce il SidebarProvider di shadcn.
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  // Su mobile la sidebar è un Sheet: si chiude quando si sceglie una voce.
  const onNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };
  const sectionsRaw = useSyncExternalStore(subscribeSections, readSections, () => "");
  const sectionChoices = useMemo(() => parseSections(sectionsRaw), [sectionsRaw]);
  // Pagina su cui l'utente ha chiuso la sezione attiva: lì resta chiusa, ma
  // andando su un'altra pagina della sezione si riapre da sola.
  const [activeClosedOn, setActiveClosedOn] = useState<string | null>(null);

  const isAdmin = isAdminRole(currentUser.role);
  const companyLinks: NavLink[] = isAdmin
    ? [...ADMIN_COMPANY_LINKS, ORG_LINK]
    : [...(showReparto ? [REPARTO_LINK] : []), ...(showClients ? [CLIENTS_LINK] : []), ORG_LINK];
  const resourceLinks: NavLink[] = [
    ...(showLicenses ? [LICENSES_LINK] : []),
    VPN_LINK,
    CLOUD_LINK,
    ...(ssoAccountUrl ? [{ href: ssoAccountUrl, label: "Account SSO", icon: ShieldCheck, external: true }] : []),
  ];
  const sections = [
    { label: "Ogni giorno", links: DAILY_LINKS },
    { label: "Azienda", links: companyLinks },
    { label: "Risorse", links: resourceLinks },
  ];
  const userMenuLinks = currentUser.role === "super_admin" ? SUPER_ADMIN_MENU_LINKS : [];

  // Confronto per segmento: "/richieste" non deve accendersi su
  // "/richieste-team".
  function isActive(link: NavLink) {
    if (link.external) return false;
    return link.href === "/"
      ? pathname === "/"
      : pathname === link.href || pathname.startsWith(`${link.href}/`);
  }

  function badgeFor(href: string) {
    if (href === "/richieste-team") return teamPendingCount;
    if (href === "/reparto") return repartoPendingCount;
    return 0;
  }

  // Sezioni chiuse finché l'utente non le apre ("Ogni giorno" aperta); quella della pagina corrente
  // si apre da sola.
  const activeSection = sections.find((section) => section.links.some(isActive))?.label;

  function isSectionOpen(label: string) {
    if (label === activeSection) return activeClosedOn !== pathname;
    // "Ogni giorno" (ore, richieste…) si usa ogni giorno: aperta finché
    // l'utente non la chiude.
    return sectionChoices[label] ?? label === "Ogni giorno";
  }

  function setSectionOpen(label: string, open: boolean) {
    writeSections({ ...sectionChoices, [label]: open });
    if (label === activeSection) setActiveClosedOn(open ? null : pathname);
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu className="flex-row items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <SidebarMenuItem className="min-w-0 flex-1">
            <SidebarMenuButton
              size="lg"
              tooltip={isAdmin ? "Report" : "Oggi"}
              render={<Link href={homePathFor(currentUser.role)} onClick={onNavigate} />}
            >
              {/* Riquadro quadrato come nel "team switcher" di shadcn: resta
                  intero anche con la sidebar compressa a icone. */}
              <span className="flex aspect-square size-8 shrink-0 items-center justify-center">
                <Marchio className="h-6! w-auto!" />
              </span>
              <span className="truncate font-heading text-lg font-semibold text-foreground">Softuerino</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/* Su mobile il Sheet ha già la sua chiusura. */}
          {!isMobile && (
            <SidebarMenuItem>
              <SidebarTrigger title={collapsed ? "Espandi" : "Comprimi"} />
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => {
          // Compressa a icone non ci sono titoli: le voci restano tutte visibili.
          const open = collapsed || isSectionOpen(section.label);
          const sectionBadge = section.links.reduce((sum, link) => sum + badgeFor(link.href), 0);
          return (
            <Collapsible
              key={section.label}
              open={open}
              onOpenChange={(next) => setSectionOpen(section.label, next)}
            >
              <SidebarGroup>
                <SidebarGroupLabel render={<CollapsibleTrigger />}>
                  {section.label}
                  {!open && sectionBadge > 0 && (
                    <span
                      className={cn("ml-2 size-2 rounded-full", TONE_DOT.warning)}
                      aria-label={`${sectionBadge} in attesa`}
                    />
                  )}
                  <ChevronDown className={cn("ml-auto transition-transform", !open && "-rotate-90")} />
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {section.links.map((link) => {
                        const Icon = link.icon;
                        const badge = badgeFor(link.href);
                        return (
                          <SidebarMenuItem key={link.href}>
                            <SidebarMenuButton
                              isActive={isActive(link)}
                              tooltip={
                                link.external
                                  ? `${link.label} (nuova scheda)`
                                  : badge > 0
                                    ? `${link.label} (${badge} in attesa)`
                                    : link.label
                              }
                              render={
                                link.external ? (
                                  <a href={link.href} target="_blank" rel="noopener noreferrer" onClick={onNavigate} />
                                ) : (
                                  <Link href={link.href} onClick={onNavigate} />
                                )
                              }
                            >
                              <Icon />
                              <span>{link.label}</span>
                              {link.external && (
                                <ExternalLink
                                  className="ml-auto text-muted-foreground"
                                  aria-label="si apre in una nuova scheda"
                                />
                              )}
                            </SidebarMenuButton>
                            {badge > 0 && (
                              <SidebarMenuBadge className={cn("rounded-full", TONE_SOFT.warning)}>
                                {badge}
                              </SidebarMenuBadge>
                            )}
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={currentUser.name} />}>
                <LevelAvatar name={currentUser.name} role={currentUser.role} departments={managed} />
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate text-sm font-semibold text-foreground">{currentUser.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {levelSummary(currentUser.role, managed)}
                  </span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side={isMobile ? "top" : "right"} className="w-56">
                <div className="px-1.5 py-1.5">
                  <p className="truncate text-sm font-medium text-foreground">{currentUser.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{currentUser.email}</p>
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
                {userMenuLinks.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {userMenuLinks.map((link) => {
                      const Icon = link.icon;
                      return (
                        <DropdownMenuItem key={link.href} render={<Link href={link.href} onClick={onNavigate} />}>
                          <Icon />
                          {link.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </>
                )}
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

// Mobile: barra in alto con il pulsante che apre la sidebar (Sheet di shadcn).
export function MobileTopBar({
  homeHref,
  pendingCount = 0,
}: {
  homeHref: string;
  // Richieste in attesa: pallino sul pulsante del menu.
  pendingCount?: number;
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 md:hidden">
      <span className="relative flex">
        <SidebarTrigger aria-label="Apri il menu" className="size-10" />
        {pendingCount > 0 && (
          <span
            className={cn("pointer-events-none absolute top-2 right-2 size-2 rounded-full", TONE_DOT.warning)}
            aria-hidden="true"
          />
        )}
      </span>
      <Link href={homeHref} className="flex min-w-0 items-center gap-2.5">
        <Marchio className="h-[26px]" />
        <span className="truncate font-heading text-lg leading-7 font-semibold text-foreground">Softuerino</span>
      </Link>
    </header>
  );
}
