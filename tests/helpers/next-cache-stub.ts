// Importare DOPO ./next-stubs e PRIMA del codice dell'app. Sostituisce next/cache
// (revalidatePath) e next/server (after) con versioni che registrano le chiamate:
// nessuna cache da invalidare, nessuna email che parte.
import { stubs } from "./next-stubs";

export const cacheCalls = { revalidated: [] as string[], after: 0 };

export function resetCacheCalls() {
  cacheCalls.revalidated.length = 0;
  cacheCalls.after = 0;
}

stubs["next/cache"] = {
  revalidatePath: (p: string) => void cacheCalls.revalidated.push(p),
  revalidateTag: () => {},
};
stubs["next/server"] = {
  after: () => void cacheCalls.after++,
};
