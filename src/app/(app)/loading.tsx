import { Skeleton } from "@/components/ui/skeleton";

// Mentre il server prepara la pagina: sidebar ferma, al posto del contenuto
// la sagoma di titolo, descrizione e una card. Senza, il clic su una voce del
// menu sembrava non fare niente finché la pagina non era pronta.
export default function Loading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Caricamento">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-3 rounded-xl border border-surface-border bg-card p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
