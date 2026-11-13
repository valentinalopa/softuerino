import "server-only";
import { headers } from "next/headers";
import { getAuthContext } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/task-archive";
import { ConflictError, NotFoundError, RateLimitError, ValidationError } from "@/lib/services/errors";

// API dell'app iPhone (/api/mobile/v1). Autenticazione solo con
// "Authorization: Bearer <token>": il cookie web non vale. I permessi restano
// nelle funzioni lib/service chiamate dai gestori: qui non se ne aggiungono né
// se ne tolgono. Il ruolo effettivo lo decide getAuthContext come sul web: il
// super admin fuori dalla rete interna fidata è un admin (elementi #310 e #314).

export type AuthContext = NonNullable<Awaited<ReturnType<typeof getAuthContext>>>;

// Gli errori dei service vivono in services/errors.ts; NotFoundError resta
// esportato anche da qui per le route esistenti.
export { NotFoundError };

// Risposte dell'API mobile: mai in cache (possono contenere dati personali).
const BASE_HEADERS = { "Cache-Control": "private, no-store", Pragma: "no-cache" };

export function apiError(status: number, error: string, message: string) {
  return Response.json({ error, message }, { status, headers: BASE_HEADERS });
}

// Corpo JSON di una richiesta: deve essere un oggetto, altrimenti 400.
export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Il corpo della richiesta deve essere JSON valido.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("Il corpo della richiesta deve essere un oggetto JSON.");
  }
  return body as Record<string, unknown>;
}

export function unauthorized() {
  return apiError(401, "unauthorized", "Accesso non autorizzato: effettua di nuovo il login.");
}

// Il redirect() di Next (requireUser...) è un'eccezione con digest NEXT_REDIRECT.
function isNextRedirect(err: unknown) {
  if (typeof err !== "object" || err === null) return false;
  const { digest, message } = err as { digest?: unknown; message?: unknown };
  return (
    (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) ||
    (typeof message === "string" && message.startsWith("NEXT_REDIRECT"))
  );
}

// Secondo argomento delle route dinamiche di Next: { params: Promise<{...}> }.
export type RouteContext<P extends Record<string, string> = Record<string, string>> = { params: Promise<P> };

export function withMobileAuth<T, P extends Record<string, string> = Record<string, string>>(
  handler: (ctx: AuthContext, req: Request, route: RouteContext<P>) => Promise<T>
) {
  return async (req: Request, route: RouteContext<P> = { params: Promise.resolve({} as P) }): Promise<Response> => {
    try {
      // Solo Bearer: senza header (anche con cookie web valido) → 401.
      const authorization = (await headers()).get("authorization");
      if (!authorization || !/^Bearer\s+\S+\s*$/i.test(authorization)) return unauthorized();

      // getSession (dentro getAuthContext) con Bearer accetta solo sessioni "ios"
      // e rifiuta utenti disattivati.
      const ctx = await getAuthContext();
      if (!ctx) return unauthorized();

      // Il super admin fuori dalla rete interna è già un admin: lo decide
      // getAuthContext, come sul web (elemento #310). Nessun 403 dedicato.

      const result = await handler(ctx, req, route);
      if (result instanceof Response) return result;
      return Response.json(result, { headers: BASE_HEADERS });
    } catch (err) {
      if (isNextRedirect(err)) return unauthorized();
      if (err instanceof ForbiddenError) return apiError(403, "forbidden", err.message);
      if (err instanceof NotFoundError) return apiError(404, "not_found", err.message);
      if (err instanceof ValidationError) return apiError(400, "invalid_request", err.message);
      if (err instanceof ConflictError) return apiError(409, "conflict", err.message);
      // BASE_HEADERS (no-store) anche sul 429.
      if (err instanceof RateLimitError) return apiError(429, "rate_limited", err.message);
      console.error("[mobile-api] errore imprevisto:", err instanceof Error ? err.message : err);
      return apiError(500, "internal_error", "Errore imprevisto. Riprova più tardi.");
    }
  };
}
