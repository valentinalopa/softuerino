import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// "Scarica configurazione": il file .ovpn arriva da Softuerino (route con
// login e registro dei download), mai da un link esterno.
export function VpnDownloadActions({
  id,
  name,
  fileName,
}: {
  id: string;
  name: string;
  fileName: string | null;
}) {
  if (!fileName) {
    return <p className="text-sm text-muted-foreground">Configurazione non ancora caricata.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href={`/api/vpn/${id}/config`}
        download={fileName}
        aria-label={`Scarica la configurazione della VPN ${name}`}
        className={buttonVariants()}
      >
        <Download className="size-4" />
        Scarica configurazione
      </a>
      <span className="text-xs text-muted-foreground">{fileName}</span>
    </div>
  );
}
