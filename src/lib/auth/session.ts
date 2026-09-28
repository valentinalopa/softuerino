import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

const SESSION_DURATION_DAYS = 30; // placeholder, nessun requisito specifico ricevuto
// L'impersonificazione si chiude da sola dopo questo tempo.
export const IMPERSONATION_DURATION_MINUTES = 60;

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
// (user). Coincidono, tranne quando un super admin impersona un membro: allora
// `user` è il membro e tutte le pagine si comportano come per lui.
// L'impersonificazione vale solo se ancora valida: non scaduta, fatta da un
// super admin, verso un membro attivo che non sia a sua volta super admin.
export const getAuthContext = cache(async () => {
  const session = await getSession();
  if (!session || !session.user.active) return null;

  const realUser = session.user;
  const target = session.impersonatedUser;
  const impersonating =
    realUser.role === "super_admin" &&
    target !== null &&
    target.active &&
    target.role !== "super_admin" &&
    session.impersonationExpiresAt !== null &&
    session.impersonationExpiresAt > new Date();

  return {
    realUser,
    user: impersonating ? target : realUser,
    impersonation: impersonating
      ? { expiresAt: session.impersonationExpiresAt! }
      : null,
  };
});

// L'utente "effettivo": durante un'impersonificazione è il membro impersonato.
export async function requireUser() {
  const context = await getAuthContext();
  if (!context) {
    redirect("/login");
  }
  return context.user;
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (user.role !== "super_admin") {
    redirect("/");
  }
  return user;
}

// Avvia l'impersonificazione sulla sessione corrente. Il controllo dei
// permessi (solo super admin, verso un membro attivo non super admin) sta
// nella server action che la chiama.
export async function setImpersonation(targetUserId: string | null) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return;

  await prisma.session.update({
    where: { token: hashToken(token) },
    data: targetUserId
      ? {
          impersonatedUserId: targetUserId,
          impersonationExpiresAt: new Date(
            Date.now() + IMPERSONATION_DURATION_MINUTES * 60 * 1000
          ),
        }
      : { impersonatedUserId: null, impersonationExpiresAt: null },
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

  await prisma.session.deleteMany({
    where: {
      userId,
      ...(currentTokenHash ? { token: { not: currentTokenHash } } : {}),
    },
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { token: hashToken(token) } });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
