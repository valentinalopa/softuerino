"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPasswordTimingSafe } from "@/lib/auth/password";
import {
  createSession,
  destroySession,
  getAuthContext,
  getSession,
  setImpersonation,
} from "@/lib/auth/session";
import { homePathFor } from "@/lib/constants";

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

  await createSession(user.id);
  redirect(homePathFor(user.role));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

// Solo il super admin (quello reale, non quello impersonato) può vedere l'app
// come un altro membro, in sola lettura. Mai verso un altro super admin.
export async function startImpersonationAction(targetUserId: string) {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  if (context.realUser.role !== "super_admin") {
    return { error: "Non autorizzato" };
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, active: true, role: true },
  });
  if (!target || !target.active) {
    return { error: "Membro non trovato o non attivo" };
  }
  if (target.role === "super_admin") {
    return { error: "Non è possibile vedere l'app come un altro super admin" };
  }
  if (target.id === context.realUser.id) {
    return { error: "Stai già vedendo l'app come te stesso" };
  }

  await setImpersonation(target.id);
  redirect("/");
}

export async function stopImpersonationAction() {
  const [context, session] = await Promise.all([getAuthContext(), getSession()]);
  if (!context) redirect("/login");
  const targetUserId = session?.impersonatedUserId;

  // Nessun controllo di ruolo: chiudere l'impersonificazione è sempre lecito
  // (e deve funzionare anche se nel frattempo è scaduta).
  await setImpersonation(null);
  // Si torna alla scheda del membro da cui si era partiti.
  redirect(
    context.realUser.role === "super_admin"
      ? targetUserId
        ? `/team/${targetUserId}`
        : "/team"
      : "/"
  );
}
