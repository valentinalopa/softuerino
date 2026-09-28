import { Eye, Undo2 } from "lucide-react";
import { stopImpersonationAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

// Fisso in cima alla pagina per tutta la durata dell'impersonificazione, così
// non ci si dimentica di stare guardando l'app con gli occhi di un altro.
export function ImpersonationBanner({ userName }: { userName: string }) {
  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-100 px-6 py-2.5 text-sm text-amber-900 md:px-10 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="flex items-center gap-2">
        <Eye className="size-4 shrink-0" />
        <span>
          Stai vedendo Softuerino come <strong className="font-semibold">{userName}</strong>
          <span className="text-amber-800/80 dark:text-amber-200/70">
            {" "}
            · sola lettura
          </span>
        </span>
      </p>
      <form action={stopImpersonationAction}>
        <Button type="submit" size="sm" variant="outline" className="border-amber-600/40 bg-transparent">
          <Undo2 />
          Torna al tuo profilo
        </Button>
      </form>
    </div>
  );
}
