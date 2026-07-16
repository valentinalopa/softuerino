"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function TeamMemberRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <TableRow
      onClick={() => router.push(href)}
      onKeyDown={(event) => {
        // Ignora i keydown che risalgono da elementi interattivi annidati nella riga
        // (es. il bottone Elimina), altrimenti Invio lì attiverebbe anche la navigazione.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(href);
        }
      }}
      tabIndex={0}
      role="link"
      className={cn(
        "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className
      )}
    >
      {children}
    </TableRow>
  );
}
