import { requireSuperAdmin } from "@/lib/auth/session";
import { ImportPanel } from "@/components/impostazioni/ImportPanel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Importa dati" };

// Import di saldi e assenze da file (vedi lib/import-saldi.ts): solo super admin.
export default async function ImportaPage() {
  await requireSuperAdmin();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1>Importa dati</h1>
        <p className="text-sm text-muted-foreground">
          Saldi dalle buste paga, residui delle partite IVA, assenze passate e chiusure aziendali, da un file
          preparato apposta.
        </p>
      </div>
      <ImportPanel />
    </div>
  );
}
