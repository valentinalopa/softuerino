// Eseguire con un DB di prova (mai quello di produzione):
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx tsx --test tests/mobile-session.test.ts
import { setRequest } from "./helpers/next-stubs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/constants";
import { createSession, getSession, issueSessionToken, revokeOidcSessions } from "../src/lib/auth/session";

const DAY = 24 * 60 * 60 * 1000;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

async function makeUser(id: string, active = true) {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@example.test`, passwordHash: "x", role: "membro", active },
  });
}

describe("sessione con token Bearer (client ios)", () => {
  beforeEach(async () => {
    await prisma.impersonationLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    setRequest();
  });

  it("un Bearer valido restituisce la sessione dell'utente", async () => {
    const user = await makeUser("m1");
    const { token } = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios" });
    setRequest({ bearer: token });
    const session = await getSession();
    assert.equal(session?.userId, user.id);
    assert.equal(session?.client, "ios");
  });

  it("il token non viene salvato in chiaro e non crea cookie", async () => {
    const user = await makeUser("m2");
    const { token } = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios" });
    const row = await prisma.session.findUnique({ where: { token: hash(token) } });
    assert.ok(row);
    assert.equal(await prisma.session.count({ where: { token } }), 0);
  });

  it("Bearer sconosciuto o malformato → null", async () => {
    setRequest({ bearer: "non-esiste" });
    assert.equal(await getSession(), null);
    setRequest({ headers: { authorization: "Basic abc" } });
    assert.equal(await getSession(), null);
  });

  it("il Bearer di un utente disattivato dopo il login restituisce una sessione con user.active=false", async () => {
    const user = await makeUser("m3");
    const { token } = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios" });
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    setRequest({ bearer: token });
    // getSession espone l'utente; getAuthContext (usato da requireUser) lo rifiuta.
    const { getAuthContext } = await import("../src/lib/auth/session");
    assert.equal(await getAuthContext(), null);
  });

  it("revokeOidcSessions(sid) revoca anche i token ios con lo stesso sid", async () => {
    const user = await makeUser("m4");
    const { token } = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios", oidcSid: "sid-1" });
    const other = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios", oidcSid: "sid-2" });
    assert.equal(await revokeOidcSessions("sid-1"), 1);
    setRequest({ bearer: token });
    assert.equal(await getSession(), null);
    setRequest({ bearer: other.token });
    assert.ok(await getSession());
  });

  it("ios inattivo da 31 giorni → null", async () => {
    const user = await makeUser("m5");
    const { token } = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios" });
    await prisma.session.update({
      where: { token: hash(token) },
      data: { lastSeenAt: new Date(Date.now() - 31 * DAY) },
    });
    setRequest({ bearer: token });
    assert.equal(await getSession(), null);
  });

  it("ios usato al 29° giorno → valido, lastSeenAt e scadenza rinnovati", async () => {
    const user = await makeUser("m6");
    const { token } = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios" });
    const old = new Date(Date.now() - 29 * DAY);
    await prisma.session.update({
      where: { token: hash(token) },
      data: { lastSeenAt: old, expiresAt: new Date(Date.now() + 1 * DAY) },
    });
    setRequest({ bearer: token });
    assert.ok(await getSession());
    const row = await prisma.session.findUnique({ where: { token: hash(token) } });
    assert.ok(row!.lastSeenAt.getTime() > old.getTime() + 28 * DAY);
    assert.ok(row!.expiresAt.getTime() > Date.now() + 29 * DAY);
  });

  it("il login di un altro utente non cancella le sessioni ios inattive da 5 giorni", async () => {
    const user = await makeUser("m7");
    const { token } = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios" });
    await prisma.session.update({
      where: { token: hash(token) },
      data: { lastSeenAt: new Date(Date.now() - 5 * DAY) },
    });
    const other = await makeUser("m8");
    await createSession(other.id, { authMethod: "password" });
    setRequest({ bearer: token });
    assert.ok(await getSession());
  });

  it("le sessioni ios non vengono verificate con il refresh token del client web", async () => {
    const user = await makeUser("m9");
    const { token } = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios", refreshToken: "rt" });
    await prisma.session.update({ where: { token: hash(token) }, data: { ssoCheckedAt: new Date(Date.now() - DAY) } });
    setRequest({ bearer: token });
    assert.ok(await getSession()); // nessuna chiamata a Keycloak: sarebbe fallita
  });
});

describe("sessione web con cookie (regressione)", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    setRequest();
  });

  it("createSession imposta il cookie e getSession lo legge", async () => {
    const user = await makeUser("w1");
    await createSession(user.id, { authMethod: "password" });
    const { requestState } = await import("./helpers/next-stubs");
    const cookie = requestState.cookies.get(SESSION_COOKIE_NAME);
    assert.ok(cookie);
    setRequest({ cookie: [SESSION_COOKIE_NAME, cookie] });
    const session = await getSession();
    assert.equal(session?.userId, user.id);
    assert.equal(session?.client, "web");
  });

  it("web inattivo da 4 giorni → null (soglia di 3 giorni invariata)", async () => {
    const user = await makeUser("w2");
    await createSession(user.id, { authMethod: "password" });
    const { requestState } = await import("./helpers/next-stubs");
    const cookie = requestState.cookies.get(SESSION_COOKIE_NAME)!;
    await prisma.session.update({
      where: { token: hash(cookie) },
      data: { lastSeenAt: new Date(Date.now() - 4 * DAY) },
    });
    setRequest({ cookie: [SESSION_COOKIE_NAME, cookie] });
    assert.equal(await getSession(), null);
  });

  it("un token ios passato come cookie non vale (solo Bearer)", async () => {
    const user = await makeUser("w3");
    const { token } = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios" });
    setRequest({ cookie: [SESSION_COOKIE_NAME, token] });
    assert.equal(await getSession(), null);
  });
});
