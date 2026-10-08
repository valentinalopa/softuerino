"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// Su mobile le tabelle diventano un elenco di schede, una per riga: niente
// colonne fuori schermo. Da md in su resta la tabella (Table con
// containerClassName="hidden md:block").
export function MobileList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("divide-y divide-border md:hidden", className)}>{children}</ul>;
}

// Scheda dell'elenco. Con href (o onOpen) è cliccabile come una LinkRow: i
// clic su pulsanti, link e campi dentro la scheda hanno la loro azione.
export function MobileListItem({
  href,
  onOpen,
  label,
  className,
  children,
}: {
  href?: string;
  onOpen?: () => void;
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const open = href ? () => router.push(href) : onOpen;

  if (!open) return <li className={cn("space-y-2 px-4 py-4", className)}>{children}</li>;
  return (
    <li
      tabIndex={0}
      role={href ? "link" : "button"}
      aria-label={label}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (!event.currentTarget.contains(target)) return;
        if (target.closest("button, a, input, select, textarea")) return;
        open();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      className={cn(
        "cursor-pointer space-y-2 px-4 py-4 transition-colors duration-ds active:bg-subtle focus-visible:bg-subtle focus-visible:outline-none",
        className
      )}
    >
      {children}
    </li>
  );
}
