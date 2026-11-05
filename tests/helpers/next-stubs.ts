// Importare PER PRIMO nei test che toccano codice server di Next (session.ts, network.ts...).
// Sostituisce server-only, next/headers e next/navigation con versioni controllabili
// dal test: nessuna modifica al codice dell'app.
import Module from "node:module";

type Cookie = { name: string; value: string };

export const requestState = {
  headers: new Headers(),
  cookies: new Map<string, string>(),
};

// Con `bearer` simula una richiesta sotto /api/mobile/: l'header interno lo mette
// il proxy (src/proxy.ts), qui lo aggiunge il test. `mobile: false` lo toglie per
// simulare un Bearer su una pagina web; con `headers` si può anche falsificarlo.
export function setRequest(
  opts: { bearer?: string; mobile?: boolean; cookie?: [string, string]; headers?: Record<string, string> } = {}
) {
  requestState.headers = new Headers(opts.headers ?? {});
  if (opts.bearer) requestState.headers.set("authorization", `Bearer ${opts.bearer}`);
  if (opts.bearer && opts.mobile !== false) requestState.headers.set("x-softuerino-mobile", "1");
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
      get: (name: string): Cookie | undefined => {
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
};

// Finto openid-client: l'unico confine con Keycloak. I test decidono cosa
// rispondono lo scambio del codice e il refresh, e leggono con quale client
// (id e autenticazione) è stata fatta la chiamata.
export class FakeResponseBodyError extends Error {
  constructor(readonly error: string) {
    super(error);
  }
}
type FakeConfig = { clientId: string; auth: string };
export const openidMock = {
  refreshImpl: async (_config: FakeConfig, _refreshToken: string): Promise<unknown> => ({
    id_token: null,
    refresh_token: "nuovo-rt",
    claims: () => undefined,
  }),
  codeImpl: async (_config: FakeConfig, _url: URL, _checks: Record<string, unknown>): Promise<unknown> => {
    throw new Error("codeImpl non impostato");
  },
  calls: [] as { fn: string; clientId: string; auth: string; extra?: unknown }[],
};
stubs["openid-client"] = {
  discovery: async (_issuer: URL, clientId: string, _meta: unknown, auth: { kind: string }) => ({
    clientId,
    auth: auth.kind,
    serverMetadata: () => ({ issuer: "https://sso.test/realms/x", jwks_uri: "https://sso.test/jwks" }),
  }),
  ClientSecretBasic: () => ({ kind: "secret" }),
  None: () => ({ kind: "none" }),
  ResponseBodyError: FakeResponseBodyError,
  refreshTokenGrant: async (config: FakeConfig, rt: string) => {
    openidMock.calls.push({ fn: "refresh", clientId: config.clientId, auth: config.auth });
    return openidMock.refreshImpl(config, rt);
  },
  authorizationCodeGrant: async (config: FakeConfig, url: URL, checks: Record<string, unknown>) => {
    openidMock.calls.push({ fn: "code", clientId: config.clientId, auth: config.auth, extra: { url: url.href, checks } });
    return openidMock.codeImpl(config, url, checks);
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = Module as any;
const originalLoad = M._load;
M._load = function (request: string, ...rest: unknown[]) {
  if (request in stubs) return stubs[request];
  return originalLoad.call(this, request, ...rest);
};
