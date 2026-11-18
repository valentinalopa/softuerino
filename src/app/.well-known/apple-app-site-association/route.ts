import { appleAppSiteAssociation } from "@/lib/mobile/associated-domains";

// Letto a ogni richiesta: l'app id viene dall'ambiente, non dal build.
export const dynamic = "force-dynamic";

// Pubblico (Apple lo scarica senza cookie), JSON, nessun redirect.
export function GET() {
  const body = appleAppSiteAssociation(process.env.MOBILE_APPLE_APP_ID);
  if (!body) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
