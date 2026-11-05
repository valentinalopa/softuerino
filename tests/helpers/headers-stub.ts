// Importare PER PRIMO nei test che toccano codice server di Next (session.ts,
// network.ts, auth/actions.ts...). Sostituisce server-only, next/headers,
// next/navigation e next/cache con versioni controllabili dal test: nessuna
// modifica al codice dell'app.
import Module from "node:module";

export const requestState = {
  headers: new Headers(),
  cookies: new Map<string, string>(),
};

// Simula una richiesta: `headers` come li vede Next dopo Nginx, `cookie` quello di sessione.
export function setRequest(opts: { headers?: Record<string, string>; cookie?: [string, string] } = {}) {
  requestState.headers = new Headers(opts.headers ?? {});
  requestState.cookies = new Map();
  if (opts.cookie) requestState.cookies.set(opts.cookie[0], opts.cookie[1]);
}

export class RedirectSignal extends Error {
  constructor(readonly destination: string) {
    super(`NEXT_REDIRECT:${destination}`);
  }
}

const stubs: Record<string, unknown> = {
  "server-only": {},
  "next/headers": {
    headers: async () => requestState.headers,
    cookies: async () => ({
      get: (name: string) => {
        const value = requestState.cookies.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => void requestState.cookies.set(name, value),
      delete: (name: string) => void requestState.cookies.delete(name),
    }),
  },
  "next/navigation": {
    redirect: (destination: string) => {
      throw new RedirectSignal(destination);
    },
  },
  "next/cache": {
    revalidatePath: () => {},
    revalidateTag: () => {},
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = Module as any;
const originalLoad = M._load;
M._load = function (request: string, ...rest: unknown[]) {
  if (request in stubs) return stubs[request];
  return originalLoad.call(this, request, ...rest);
};
