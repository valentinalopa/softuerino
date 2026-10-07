import { timingSafeEqual } from "crypto";
import { sendLicenseReminders } from "@/lib/licenses/reminders";

// Chiamata dal timer giornaliero della VM (softuerino-license-reminders):
// autenticata con CRON_SECRET (Authorization: Bearer ...). Senza segreto
// configurato la route non esiste.
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
  const result = await sendLicenseReminders();
  console.log(`[licenze] avvisi di scadenza: ${result.skipped ?? `${result.sent.length} inviati`}`);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
