import { timingSafeEqual } from "crypto";
import { applyRetention } from "@/lib/retention";

// Chiamata dal timer giornaliero della VM (softuerino-retention): autenticata
// con CRON_SECRET (Authorization: Bearer ...). Senza segreto la route non
// esiste. Per default è un DRY-RUN: conta e basta. Cancella/anonimizza solo se
// il corpo contiene {"apply":true}, che lo script del timer manda soltanto con
// RETENTION_APPLY=1 nell'ambiente della unit systemd (non nel .env).
function authorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response(null, { status: 404 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let apply = false;
  try {
    const body = (await request.json()) as { apply?: unknown };
    apply = body.apply === true;
  } catch {
    // Nessun corpo: dry-run.
  }
  const result = await applyRetention(new Date(), apply);
  // Solo conteggi: niente nomi né email nel journal.
  console.log(`[retention] utenti=${result.users} richieste=${result.accountRequests} applicato=${result.applied}`);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
