import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Pagina non trovata" };

// Pagina inesistente (link vecchio o scritto male): stesso stile della
// pagina di errore, invece della schermata di default di Next.
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1>Pagina non trovata</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Il link potrebbe essere vecchio o scritto male, oppure la pagina è stata spostata.
      </p>
      <Link href="/" className={buttonVariants()}>
        Torna a Oggi
      </Link>
    </div>
  );
}
