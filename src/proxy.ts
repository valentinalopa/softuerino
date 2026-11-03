import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

// /privacy: informativa privacy, si legge anche senza accedere.
const PUBLIC_PATHS = ["/login", "/privacy"];

// Controllo ottimistico: verifica solo la presenza del cookie di sessione,
// non la sua validita/scadenza (richiede una query al DB, fatta invece
// in requireUser()/requireAdmin() dentro ogni pagina/server action).
// Nota: non reindirizza via da /login quando il cookie e presente, perche
// un cookie presente ma non piu valido (sessione scaduta/cancellata) andrebbe
// altrimenti in loop con il redirect a /login fatto da requireUser(); il
// redirect "sei gia loggato" per sessioni valide e gestito in login/page.tsx
// tramite getSession(), che verifica davvero il DB.
export function proxy(request: NextRequest) {
  const hasSession = Boolean(
    request.cookies.get(SESSION_COOKIE_NAME)?.value
  );
  // Le route del login con Keycloak servono proprio a chi non ha una sessione.
  const isPublicPath =
    PUBLIC_PATHS.includes(request.nextUrl.pathname) ||
    request.nextUrl.pathname.startsWith("/api/auth/oidc/") ||
    // Avvisi giornalieri: autenticati con CRON_SECRET, non con la sessione.
    request.nextUrl.pathname.startsWith("/api/cron/");

  if (!hasSession && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Icone del sito (favicon, icon.svg, apple-icon.png) pubbliche: servono
  // anche nella pagina di login. robots.txt pubblico: chiede ai motori di
  // ricerca di non indicizzare nulla. manifest.webmanifest e le icone della web
  // app (icon-192/512, icon-maskable-512) si leggono senza sessione: il browser
  // le richiede senza cookie e un redirect a /login le romperebbe.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|manifest.webmanifest|icon-192.png|icon-512.png|icon-maskable-512.png).*)"],
};
