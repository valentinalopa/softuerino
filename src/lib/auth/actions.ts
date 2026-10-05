"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verifyPasswordTimingSafe } from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  getAuthContext,
  getSession,
  setImpersonation,
} from "@/lib/auth/session";
import { homePathFor, isAdminRole } from "@/lib/constants";
import { buildOidcLogoutUrl, isOidcConfigured } from "@/lib/auth/oidc";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = email
    ? await prisma.user.findUnique({
        where: { email },
        omit: { passwordHash: false },
      })
    : null;

  // Il confronto password gira sempre, anche se l'utente non esiste, così i tempi
  // di risposta non rivelano quali email sono registrate.
  const valid = await verifyPasswordTimingSafe(password, user?.passwordHash ?? null);

  if (!user || !user.active || !valid) {
    redirect("/login?error=1");
  }
  // Con Keycloak attivo la password locale resta solo ai super admin, come
  // accesso di emergenza se Keycloak non risponde. Il controllo viene dopo la
  // verifica della password, così non rivela chi è super admin.
  if (isOidcConfigured() && user.role !== "super_admin") {
    redirect("/login?error=local_disabled");
  }

  await createSession(user.id, { authMethod: "password" });
  redirect(homePathFor(user.role));
}

// "Esci": chiude la sessione Softuerino e, se era nata da SSO, manda alla
// pagina di logout di Keycloak, che chiede conferma, chiude la sessione SSO
// (quindi tutte le app collegate) e riporta a /login. È una
// server action, quindi parte solo da un POST con Origin verificato da Next:
// un sito terzo non può forzare il logout. Chi chiude solo la scheda resta
// collegato a Keycloak, come prima.
export async function logoutAction() {
  const ended = await destroySession();
  const ssoLogoutUrl = ended.sso ? await buildOidcLogoutUrl() : null;
  redirect(ssoLogoutUrl ?? "/login");
}

// Solo admin e super admin (quelli reali, non quelli impersonati) possono
// vedere l'app come un membro, in sola lettura. Mai verso un admin o super admin.
export async function startImpersonationAction(targetUserId: string) {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  if (!isAdminRole(context.realUser.role)) {
    return { error: "Non autorizzato" };
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, active: true, role: true },
  });
  if (!target || !target.active) {
    return { error: "Membro non trovato o non attivo" };
  }
  if (target.role !== "membro") {
    return { error: "Si può vedere l'app solo come un membro, non come un admin" };
  }
  if (target.id === context.realUser.id) {
    return { error: "Stai già vedendo l'app come te stesso" };
  }

  await setImpersonation(target.id);
  // Cambia l'utente effettivo: va ridisegnato tutto, layout (sidebar, banner)
  // compreso, non solo la pagina di destinazione.
  revalidatePath("/", "layout");
  redirect("/");
}

export async function stopImpersonationAction() {
  const [context, session] = await Promise.all([getAuthContext(), getSession()]);
  if (!context) redirect("/login");
  const targetUserId = session?.impersonatedUserId;

  // Nessun controllo di ruolo: chiudere l'impersonificazione è sempre lecito
  // (e deve funzionare anche se nel frattempo è scaduta).
  await setImpersonation(null);
  revalidatePath("/", "layout");
  // Si torna alla scheda del membro da cui si era partiti.
  redirect(
    isAdminRole(context.realUser.role)
      ? targetUserId
        ? `/team/${targetUserId}`
        : "/team"
      : "/"
  );
}
