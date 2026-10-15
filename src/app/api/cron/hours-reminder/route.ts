import { timingSafeEqual } from "crypto";
import { sendHoursReminders } from "@/lib/hours-reminder";

// Chiamata dal timer della VM alle 19 nei giorni feriali
// (softuerino-hours-reminder): autenticata con CRON_SECRET (Authorization:
// Bearer ...). Senza segreto configurato la route non esiste. Il corpo può
// indicare il giorno ({"date":"AAAA-MM-GG"}), per le prove.
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
  let now = new Date();
  try {
    const body = (await request.json()) as { date?: unknown };
    if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      now = new Date(`${body.date}T19:00:00`);
    }
  } catch {
    // Nessun corpo: oggi.
  }
  const result = await sendHoursReminders(now);
  console.log(`[ore] promemoria: ${result.skipped ?? `${result.sent.length} inviati`}`);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
