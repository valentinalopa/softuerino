"use client";

import { Button } from "@/components/ui/button";

// Error boundary globale: senza questo file qualsiasi errore non gestito
// mostrerebbe la schermata di default di Next.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Qualcosa è andato storto</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Si è verificato un errore imprevisto. Riprova; se il problema persiste,
        segnalalo indicando il codice{" "}
        <code className="rounded bg-muted px-1.5 py-0.5">{error.digest ?? "n/d"}</code>.
      </p>
      <Button type="button" onClick={reset}>
        Riprova
      </Button>
    </div>
  );
}
