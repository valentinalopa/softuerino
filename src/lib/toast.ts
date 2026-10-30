// Conferme brevi dopo un'azione riuscita ("Task salvato"): le mostra il
// Toaster nel layout dell'app. Gli errori restano accanto al form che li ha
// prodotti, dove si può correggere.

export type Toast = { id: number; message: string };

type Listener = (toasts: Toast[]) => void;

const DURATION_MS = 3500;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast(message: string) {
  const id = nextId++;
  // Al massimo tre alla volta: le più vecchie lasciano il posto.
  toasts = [...toasts.slice(-2), { id, message }];
  emit();
  setTimeout(() => dismissToast(id), DURATION_MS);
}

export function subscribeToasts(listener: Listener) {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}
