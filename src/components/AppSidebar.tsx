"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  Megaphone,
  ChevronDown,
} from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("") || "?";
}

const COMMON_LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/richieste", label: "Giorni off", icon: ClipboardCheck },
  { href: "/presenze", label: "Presenze", icon: Clock3 },
  { href: "/ore", label: "Log ore", icon: Timer },
];

const OPERATIVITA_LINKS = [
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/task", label: "Task", icon: ListTodo },
];

const SUPER_ADMIN_LINKS = [
  { href: "/panoramica", label: "Panoramica", icon: ChartColumn },
  { href: "/team", label: "Team", icon: Users },
  { href: "/clienti", label: "Clienti", icon: Building2 },
];

const STORAGE_KEY = "softuerino:sidebar-collapsed";

export function AppSidebar({
  currentUser,
  pedClients = [],
}: {
  currentUser: { name: string; email: string; role: Role };
  // Clienti "comunicazione": sottovoci del gruppo PED.
  pedClients?: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  // Il gruppo PED parte aperto quando si è già in area PED e si apre da solo
  // quando ci si naviga (pattern React "adjust state during render"); non si
  // chiude mai in automatico, quello resta un gesto dell'utente.
  const [pedOpen, setPedOpen] = useState(() => pathname.startsWith("/ped"));
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (pathname.startsWith("/ped")) setPedOpen(true);
  }

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    setReady(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const sections =
    currentUser.role === "super_admin"
      ? [
          { label: null, links: COMMON_LINKS },
          { label: "Operatività", links: OPERATIVITA_LINKS },
          { label: "Amministrazione", links: SUPER_ADMIN_LINKS },
        ]
      : [
          { label: null, links: COMMON_LINKS },
          { label: "Operatività", links: OPERATIVITA_LINKS },
        ];

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out",
        collapsed ? "w-[68px]" : "w-60",
        !ready && "transition-none"
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4",
          collapsed && "justify-center px-0"
        )}
      >
        {!collapsed && (
          <span className="flex-1 truncate text-lg font-semibold">
            Softuerino
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Espandi" : "Comprimi"}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-4">
        {sections.map((section, index) => (
          <div key={section.label ?? "common"} className="flex flex-col gap-1">
            {index > 0 && (
              <div
                className={cn("mx-3 mb-2 border-t border-sidebar-border", collapsed && "mx-1")}
                aria-hidden="true"
              />
            )}
            {section.label && !collapsed && (
              <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/50">
                {section.label}
              </div>
            )}
            {section.links.map((link) => {
              const active =
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  title={collapsed ? link.label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center px-0"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{link.label}</span>}
                </Link>
              );
            })}
            {/* Gruppo PED: voce principale (PED supremo) + sottovoci cliente,
                come la sidebar Notion a cui il team è abituato. */}
            {section.label === "Operatività" && (
              <>
                {/* Riga unica: link + chevron condividono lo stesso "pill". */}
                <div
                  className={cn(
                    "flex items-center rounded-md transition-colors",
                    pathname === "/ped"
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center"
                  )}
                >
                  <Link
                    href="/ped"
                    title={collapsed ? "PED" : undefined}
                    className={cn(
                      "flex flex-1 items-center gap-3 px-3 py-2 text-sm",
                      pathname === "/ped" && "font-medium",
                      collapsed && "flex-none justify-center px-0"
                    )}
                  >
                    <Megaphone className="size-4 shrink-0" />
                    {!collapsed && <span className="truncate">PED</span>}
                  </Link>
                  {!collapsed && pedClients.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPedOpen((prev) => !prev)}
                      aria-label={pedOpen ? "Chiudi elenco PED" : "Apri elenco PED"}
                      aria-expanded={pedOpen}
                      className="mr-1.5 flex size-6 shrink-0 items-center justify-center rounded-sm text-current/60 transition-colors hover:bg-foreground/10 hover:text-current"
                    >
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform",
                          !pedOpen && "-rotate-90"
                        )}
                      />
                    </button>
                  )}
                </div>
                {!collapsed &&
                  pedOpen &&
                  pedClients.map((client) => {
                    const href = `/ped/${client.id}`;
                    const active = pathname.startsWith(href);
                    return (
                      <Link
                        key={client.id}
                        href={href}
                        className={cn(
                          "ml-6 flex items-center gap-2 truncate rounded-md border-l border-sidebar-border py-1.5 pl-4 pr-2 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <span className="truncate">{client.name}</span>
                      </Link>
                    );
                  })}
              </>
            )}
          </div>
        ))}
      </nav>

      <div
        className={cn(
          "border-t border-sidebar-border p-3",
          collapsed && "px-2"
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors hover:bg-sidebar-accent",
              collapsed && "justify-center"
            )}
            title={collapsed ? currentUser.name : undefined}
          >
            <Avatar size="sm" className="shrink-0">
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
                {getInitials(currentUser.name)}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <span className="min-w-0 flex-1 truncate">
                <span className="block truncate text-sm font-medium">
                  {currentUser.name}
                </span>
                <span className="block truncate text-xs text-sidebar-foreground/60">
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
