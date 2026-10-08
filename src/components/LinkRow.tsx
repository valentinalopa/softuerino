"use client";

import { useRouter } from "next/navigation";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Riga di tabella che apre una pagina (membro del Team, licenza...). I clic e
// i tasti sugli elementi interattivi dentro la riga (pulsanti, link, campi)
// hanno la loro azione e non navigano; nemmeno i clic che arrivano da popup
// aperti dalla riga (i portal React risalgono l'albero dei componenti, non
// quello del DOM).
export function LinkRow({
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
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (!event.currentTarget.contains(target)) return;
        if (target.closest("button, a, input, select, textarea")) return;
        router.push(href);
      }}
      onKeyDown={(event) => {
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
