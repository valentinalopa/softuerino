import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { isAdminRole } from "@/lib/constants";

const SESSION_DURATION_DAYS = 30; // placeholder, nessun requisito specifico ricevuto

// Il cookie contiene il token in chiaro; solo il suo hash finisce nel DB, così una
// fuga del file DB non espone token di sessione direttamente utilizzabili.
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.session.create({
    data: { userId, token: hashToken(token), expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export const getSession = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token: hashToken(token) },
    include: { user: true, impersonatedUser: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
});

// Chi sta davvero usando l'app (realUser) e per conto di chi la sta vedendo
// (user). Coincidono, tranne quando un admin o super admin impersona un membro:
// allora `user` è il membro e tutte le pagine si comportano come per lui.
// L'impersonificazione vale solo se fatta da un admin o super admin verso un
// membro attivo con ruolo "membro".
export const getAuthContext = cache(async () => {
  const session = await getSession();
  if (!session || !session.user.active) return null;

  const realUser = session.user;
  const target = session.impersonatedUser;
  const impersonating =
    isAdminRole(realUser.role) &&
    target !== null &&
    target.active &&
    target.role === "membro";

  return {
    realUser,
    user: impersonating ? target : realUser,
    impersonating,
  };
});

// Per le azioni di scrittura: durante un'impersonificazione l'app è in sola
// lettura, quindi restituisce null e l'azione deve rifiutarsi. Va usata in
// ogni server action che modifica dati (le azioni da admin sono già bloccate
// da requireAdmin/requireSuperAdmin, perché l'utente effettivo è un membro).
export async function requireWritableUser() {
  const context = await getAuthContext();
  if (!context) {
    redirect("/login");
  }
  return context.impersonating ? null : context.user;
}

// L'utente "effettivo": durante un'impersonificazione è il membro impersonato.
export async function requireUser() {
  const context = await getAuthContext();
  if (!context) {
    redirect("/login");
  }
  return context.user;
}

// Amministrazione della piattaforma: admin e super admin.
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminRole(user.role)) {
    redirect("/");
  }
  return user;
}

// Operazioni di sistema (aggiornamenti, SMTP...): solo super admin.
export async function requireSuperAdmin() {
  const user = await requireUser();
  if (user.role !== "super_admin") {
    redirect("/");
  }
  return user;
}

// Avvia (targetUserId) o chiude (null) l'impersonificazione sulla sessione
// corrente, annotandola nel registro. Il controllo dei permessi (admin o super
// admin, verso un membro attivo con ruolo "membro") sta nella server action che
// la chiama.
export async function setImpersonation(targetUserId: string | null) {
  const session = await getSession();
  if (!session) return;

  await prisma.$transaction([
    prisma.session.update({
      where: { id: session.id },
      data: { impersonatedUserId: targetUserId },
    }),
    // Chiude un'eventuale voce ancora aperta per questa sessione.
    closeImpersonationLogs(session.id),
    ...(targetUserId
      ? [
          prisma.impersonationLog.create({
            data: {
              adminId: session.userId,
              targetUserId,
              sessionId: session.id,
            },
          }),
        ]
      : []),
  ]);
}

function closeImpersonationLogs(sessionId: string) {
  return prisma.impersonationLog.updateMany({
    where: { sessionId, endedAt: null },
    data: { endedAt: new Date() },
  });
}

// Revoca le sessioni di un utente dopo un cambio password: tutte, oppure
// tutte tranne quella corrente (per non buttare fuori chi sta cambiando la
// propria password dal dispositivo su cui è loggato).
export async function revokeSessions(
  userId: string,
  { exceptCurrent = false }: { exceptCurrent?: boolean } = {}
) {
  let currentTokenHash: string | undefined;
  if (exceptCurrent) {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    currentTokenHash = token ? hashToken(token) : undefined;
  }

  const where = {
    userId,
    ...(currentTokenHash ? { token: { not: currentTokenHash } } : {}),
  };
  const sessions = await prisma.session.findMany({ where, select: { id: true } });
  const sessionIds = sessions.map((session) => session.id);

  await prisma.$transaction([
    // Le impersonificazioni in corso su queste sessioni finiscono con loro.
    prisma.impersonationLog.updateMany({
      where: { sessionId: { in: sessionIds }, endedAt: null },
      data: { endedAt: new Date() },
    }),
    prisma.session.deleteMany({ where: { id: { in: sessionIds } } }),
  ]);
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    // Il logout chiude anche un'impersonificazione in corso nel registro.
    const session = await prisma.session.findUnique({
      where: { token: hashToken(token) },
      select: { id: true },
    });
    if (session) {
      await prisma.$transaction([
        closeImpersonationLogs(session.id),
        prisma.session.delete({ where: { id: session.id } }),
      ]);
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
