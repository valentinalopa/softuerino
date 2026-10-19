import { unstable_isUnrecognizedActionError } from "next/navigation";

// Messaggio per un'azione lato server finita in eccezione. Dopo un
// aggiornamento di Softuerino le pagine già aperte chiamano azioni della
// versione precedente, che il server non riconosce più: basta ricaricare.
export function unexpectedErrorMessage(error: unknown) {
  return unstable_isUnrecognizedActionError(error)
    ? "Softuerino è stato aggiornato: ricarica la pagina e riprova"
    : "Errore imprevisto";
}
