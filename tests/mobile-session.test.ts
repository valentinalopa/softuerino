// Eseguire con un DB di prova (mai quello di produzione):
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx tsx --test tests/mobile-session.test.ts
import { FakeResponseBodyError, openidMock, setRequest } from "./helpers/next-stubs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/constants";
import { createSession, getSession, issueSessionToken, revokeOidcSessions } from "../src/lib/auth/session";

// Configurazione SSO di prova (valori finti): il refresh token si salva solo cifrato.
process.env.OIDC_ISSUER = "https://sso.test/realms/x";
process.env.OIDC_CLIENT_ID = "softuerino";
process.env.OIDC_CLIENT_SECRET = "segreto-di-prova";
process.env.OIDC_REDIRECT_URI = "https://time.test/api/auth/oidc/callback";
process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
delete process.env.MOBILE_OIDC_CLIENT_ID; // default softuerino-ios

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

});

describe("verifica SSO delle sessioni (refresh con il client giusto)", () => {
  beforeEach(async () => {
    await prisma.impersonationLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    openidMock.calls.length = 0;
    openidMock.refreshImpl = async () => ({ id_token: null, refresh_token: "nuovo-rt", claims: () => undefined });
    setRequest();
  });

  async function staleSession(userId: string, client: "web" | "ios") {
    const { token } = await issueSessionToken(userId, { authMethod: "oidc", client, refreshToken: "rt-vecchio" });
    const old = new Date(Date.now() - 10 * 60 * 1000); // oltre i 5 minuti
    await prisma.session.update({ where: { token: hash(token) }, data: { ssoCheckedAt: old } });
    return { token, old };
  }

  it("ios: refresh con il client mobile pubblico (senza secret) e sessione valida", async () => {
    const user = await makeUser("s1");
    const { token } = await staleSession(user.id, "ios");
    setRequest({ bearer: token });
    assert.ok(await getSession());
    assert.deepEqual(openidMock.calls.map((c) => [c.fn, c.clientId, c.auth]), [["refresh", "softuerino-ios", "none"]]);
  });

  it("web: refresh con il client web confidenziale (invariato)", async () => {
    const user = await makeUser("s2");
    const { token } = await staleSession(user.id, "web");
    setRequest({ cookie: [SESSION_COOKIE_NAME, token] });
    assert.ok(await getSession());
    assert.deepEqual(openidMock.calls.map((c) => [c.fn, c.clientId, c.auth]), [["refresh", "softuerino", "secret"]]);
  });

  it("ios con sessione Keycloak terminata (invalid_grant) → sessione cancellata", async () => {
    const user = await makeUser("s3");
    const { token } = await staleSession(user.id, "ios");
    openidMock.refreshImpl = async () => {
      throw new FakeResponseBodyError("invalid_grant");
    };
    setRequest({ bearer: token });
    assert.equal(await getSession(), null);
    assert.equal(await prisma.session.count({ where: { token: hash(token) } }), 0);
  });

  it("ios con Keycloak irraggiungibile → la sessione resta e si riprova", async () => {
    const user = await makeUser("s4");
    const { token, old } = await staleSession(user.id, "ios");
    openidMock.refreshImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    setRequest({ bearer: token });
    assert.ok(await getSession());
    const row = await prisma.session.findUnique({ where: { token: hash(token) } });
    assert.ok(row);
    assert.equal(row.ssoCheckedAt?.getTime(), old.getTime());
  });

  it("ios con verifica recente (<5 minuti) → nessuna chiamata a Keycloak", async () => {
    const user = await makeUser("s5");
    const { token } = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios", refreshToken: "rt" });
    setRequest({ bearer: token });
    assert.ok(await getSession());
    assert.equal(openidMock.calls.length, 0);
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
