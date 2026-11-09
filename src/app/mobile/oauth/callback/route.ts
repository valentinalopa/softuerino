// Redirect URI HTTPS del login dell'app iPhone. Se il link universale è attivo,
// iOS intercetta la richiesta e consegna l'URL all'app: il server non vede mai
// il codice. Questa pagina compare solo se l'app non intercetta (fallback).
// È statica: non legge né registra code o state (minimizzazione, GDPR).
export const dynamic = "force-dynamic";

const HTML = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Softuerino</title>
</head>
<body>
<p>Torna all'app Softuerino.</p>
</body>
</html>
`;

export function GET() {
  return new Response(HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
