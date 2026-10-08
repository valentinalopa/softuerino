// Copia negli appunti un testo che arriva dal server (es. la chiave di una
// licenza). Safari (iPhone, iPad, Mac) accetta la copia solo dentro il clic:
// dopo l'attesa della risposta la rifiuterebbe. Con un ClipboardItem la copia
// parte subito e il testo arriva quando è pronto. Va chiamata direttamente
// nel gestore del clic, prima di qualsiasi await.
type Loaded = { key: string } | { error: string };

export async function copyFromServer(load: () => Promise<Loaded>): Promise<{ error: string } | null> {
  const pending = load();

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const item = new ClipboardItem({
      "text/plain": pending.then((result) => {
        if ("error" in result) throw new Error(result.error);
        return new Blob([result.key], { type: "text/plain" });
      }),
    });
    try {
      await navigator.clipboard.write([item]);
      return null;
    } catch {
      // Browser che non accetta un testo "in arrivo": si riprova sotto.
    }
  }

  let result: Loaded;
  try {
    result = await pending;
  } catch {
    return { error: "Errore imprevisto" };
  }
  if ("error" in result) return result;
  try {
    await navigator.clipboard.writeText(result.key);
    return null;
  } catch {
    return { error: "Copia non riuscita: usa «Mostra» e copia la chiave a mano." };
  }
}
