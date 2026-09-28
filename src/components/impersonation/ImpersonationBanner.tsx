import { Eye, Undo2 } from "lucide-react";
import { stopImpersonationAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

// Fisso in cima alla pagina per tutta la durata dell'impersonificazione, così
// non ci si dimentica di stare guardando l'app con gli occhi di un altro.
export function ImpersonationBanner({ userName }: { userName: string }) {
  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-warning-soft px-6 py-2.5 text-sm text-warning-soft-foreground backdrop-blur-sm md:px-10"
    >
      <p className="flex items-center gap-2">
        <Eye className="size-4 shrink-0" />
        <span>
          Stai vedendo Softuerino come <strong className="font-semibold">{userName}</strong>
          <span className="opacity-80">
            {" "}
            · sola lettura
          </span>
        </span>
      </p>
      <form action={stopImpersonationAction}>
        {/* Neutro, non viola: è un'uscita di servizio, non un'azione primaria. */}
        <Button type="submit" size="sm" variant="neutral">
          <Undo2 />
          Torna al tuo profilo
        </Button>
      </form>
    </div>
  );
}
