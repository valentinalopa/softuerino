import { requireSuperAdmin } from "@/lib/auth/session";
import { getUpdateStatusResponse } from "@/lib/system/update";
import { UpdatePanel } from "@/components/impostazioni/UpdatePanel";

// Aggiornamento di Softuerino dal frontend: operazione di sistema, solo super
// admin. L'esecuzione vera la fa un servizio di root (vedi lib/system/update.ts).
export default async function AggiornamentiPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-8">
      <div>
        <h1>Aggiornamenti</h1>
        <p className="text-sm text-muted-foreground">
          Versione installata, aggiornamenti disponibili su GitHub e storico.
        </p>
      </div>
      <UpdatePanel initial={await getUpdateStatusResponse()} />
    </div>
  );
}
