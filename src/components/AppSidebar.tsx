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
import { Marchio } from "@/components/brand/Marchio";
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

// Voce di navigazione — DS Sidebar: 14px, padding 10px, raggio 10px.
const NAV_ITEM =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm transition-colors duration-[120ms] ease-ds";
const NAV_ITEM_ACTIVE =
  "bg-sidebar-accent font-semibold text-sidebar-accent-foreground";
const NAV_ITEM_IDLE =
  "font-medium text-sidebar-foreground hover:bg-subtle hover:text-foreground";

const STORAGE_KEY = "softuerino:sidebar-collapsed";

export function AppSidebar({
  currentUser,
}: {
  currentUser: { name: string; email: string; role: Role };
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

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
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-[280ms] ease-ds",
        collapsed ? "w-[72px]" : "w-[248px]",
        !ready && "transition-none"
      )}
    >
      <div
        className={cn(
          "flex h-[72px] shrink-0 items-center gap-2.5 px-6",
          collapsed && "flex-col justify-center gap-1 px-0"
        )}
      >
        <Link
          href="/"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5",
            collapsed && "flex-none"
          )}
          title="Dashboard"
        >
          <Marchio className={collapsed ? "h-6" : "h-[26px]"} />
          {!collapsed && (
            <span className="truncate font-display text-lg leading-7 text-foreground">
              Softuerino
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Espandi" : "Comprimi"}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-[120ms] hover:bg-subtle hover:text-foreground"
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
              <div className="px-2 pb-1 text-xs leading-4 font-semibold tracking-[0.04em] text-muted-foreground uppercase">
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
                    NAV_ITEM,
                    active ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE,
                    collapsed && "justify-center px-0"
                  )}
                >
                  <Icon className="size-[18px] shrink-0" strokeWidth={1.5} />
                  {!collapsed && <span className="truncate">{link.label}</span>}
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
              "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors duration-[120ms] hover:bg-subtle",
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
