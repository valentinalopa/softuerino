// Login di sviluppo dell'app (Simulatore, client Keycloak "softuerino-ios-dev").
// Eseguire con un DB di prova (mai quello di produzione):
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx tsx --test tests/mobile-dev-login.test.ts
import { openidMock, setRequest } from "./helpers/next-stubs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import {
  MOBILE_REDIRECT_URI,
  OidcError,
  backchannelAudiences,
  exchangeCode,
  isMobileDevEnabled,
} from "../src/lib/auth/oidc";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/constants";
import { getSession, issueSessionToken } from "../src/lib/auth/session";
import { mobileTokenLogin } from "../src/lib/mobile/login";
import { POST as postLogout } from "../src/app/api/mobile/v1/auth/logout/route";
import { GET as getMe } from "../src/app/api/mobile/v1/me/route";

process.env.OIDC_ISSUER = "https://sso.test/realms/x";
process.env.OIDC_CLIENT_ID = "softuerino";
process.env.OIDC_CLIENT_SECRET = "segreto-di-prova";
process.env.OIDC_REDIRECT_URI = "https://time.test/api/auth/oidc/callback";
process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
delete process.env.MOBILE_OIDC_CLIENT_ID;
delete process.env.OIDC_ALLOWED_GROUP;
delete process.env.MOBILE_DEV_OIDC_CLIENT_ID;
delete process.env.MOBILE_DEV_REDIRECT_URI;

const DEV_REDIRECT = "it.colibrivision.softuerino.dev:/oauth";
const DAY = 24 * 60 * 60 * 1000;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const enableDev = () => {
  process.env.MOBILE_DEV_OIDC_CLIENT_ID = "softuerino-ios-dev";
  process.env.MOBILE_DEV_REDIRECT_URI = DEV_REDIRECT;
};
const disableDev = () => {
  delete process.env.MOBILE_DEV_OIDC_CLIENT_ID;
  delete process.env.MOBILE_DEV_REDIRECT_URI;
};

const bodyFor = (redirectUri: string) => ({ code: "codice", codeVerifier: "v".repeat(50), redirectUri });

type Kind = "ios" | "ios-dev" | undefined;
function exchangeSpy() {
  const seen: { redirectUri: string; kind: Kind }[] = [];
  return {
    seen,
    exchangeCode: async (_code: string, _verifier: string, redirectUri: string, _nonce?: string, kind?: Kind) => {
      seen.push({ redirectUri, kind });
      return {
        claims: { sub: "sub-d1", email: "d1@example.test", email_verified: true, name: "Dev Prova" } as never,
        tokens: { idToken: "idt", refreshToken: "rt-1", sid: "sid-dev" },
      };
    },
  };
}

async function makeUser(id: string) {
  return prisma.user.create({
    data: {
      id,
      name: `Nome ${id}`,
      email: `${id}@example.test`,
      passwordHash: "x",
      role: "membro",
      active: true,
      oidcSubject: `sub-${id}`,
    },
  });
}

describe("login di sviluppo: percorso disattivato", () => {
  beforeEach(async () => {
    await prisma.impersonationLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    disableDev();
    openidMock.calls.length = 0;
    setRequest();
  });

  it("senza MOBILE_DEV_*: redirect di sviluppo → 400 e nessuno scambio con Keycloak", async () => {
    assert.equal(isMobileDevEnabled(), false);
    const spy = exchangeSpy();
    const res = await mobileTokenLogin(bodyFor(DEV_REDIRECT), spy);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "invalid_request");
    assert.equal(spy.seen.length, 0);
  });

  it("con una sola delle due variabili il percorso resta spento", async () => {
    process.env.MOBILE_DEV_OIDC_CLIENT_ID = "softuerino-ios-dev";
    assert.equal(isMobileDevEnabled(), false);
    disableDev();
    process.env.MOBILE_DEV_REDIRECT_URI = DEV_REDIRECT;
    assert.equal(isMobileDevEnabled(), false);
    const res = await mobileTokenLogin(bodyFor(DEV_REDIRECT), exchangeSpy());
    assert.equal(res.status, 400);
  });

  it("exchangeCode con il client di sviluppo spento → OidcError('failed'), nessuna chiamata", async () => {
    await assert.rejects(
      exchangeCode("c", "v", DEV_REDIRECT, undefined, "ios-dev"),
      (e: unknown) => e instanceof OidcError && e.code === "failed"
    );
    assert.equal(openidMock.calls.length, 0);
  });

  it("il back-channel logout accetta solo web e ios", () => {
    assert.deepEqual(backchannelAudiences(), ["softuerino", "softuerino-ios"]);
  });
});

describe("login di sviluppo: percorso attivo", () => {
  beforeEach(async () => {
    await prisma.impersonationLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    enableDev();
    openidMock.calls.length = 0;
    openidMock.refreshImpl = async () => ({ id_token: null, refresh_token: "nuovo-rt", claims: () => undefined });
    setRequest();
  });

  it("redirect di sviluppo → login ok con client ios-dev, sessione valida su /me", async () => {
    assert.equal(isMobileDevEnabled(), true);
    const user = await makeUser("d1");
    const spy = exchangeSpy();
    const res = await mobileTokenLogin(bodyFor(DEV_REDIRECT), spy);
    assert.equal(res.status, 200);
    assert.deepEqual(spy.seen, [{ redirectUri: DEV_REDIRECT, kind: "ios-dev" }]);
    const body = await res.json();
    assert.equal(body.user.id, user.id);
    const row = await prisma.session.findUnique({ where: { token: hash(body.token) } });
    assert.equal(row?.client, "ios-dev");
    setRequest({ bearer: body.token });
    assert.equal((await getMe(new Request("https://time.test/api/mobile/v1/me"))).status, 200);
  });

  it("redirect di produzione invariato: client ios, anche con il dev attivo", async () => {
    await makeUser("d1");
    const spy = exchangeSpy();
    const res = await mobileTokenLogin(bodyFor(MOBILE_REDIRECT_URI), spy);
    assert.equal(res.status, 200);
    assert.deepEqual(spy.seen, [{ redirectUri: MOBILE_REDIRECT_URI, kind: "ios" }]);
    const body = await res.json();
    const row = await prisma.session.findUnique({ where: { token: hash(body.token) } });
    assert.equal(row?.client, "ios");
  });

  it("un redirect qualunque resta rifiutato (400)", async () => {
    const spy = exchangeSpy();
    const res = await mobileTokenLogin(bodyFor("https://evil.test/cb"), spy);
    assert.equal(res.status, 400);
    assert.equal(spy.seen.length, 0);
  });

  it("exchangeCode usa il client softuerino-ios-dev senza secret e il redirect di sviluppo", async () => {
    openidMock.codeImpl = async () => ({
      id_token: "idt",
      refresh_token: "rt",
      claims: () => ({ sub: "s", sid: "sid-x" }),
    });
    await exchangeCode("codice", "verifier-pkce", DEV_REDIRECT, undefined, "ios-dev");
    const call = openidMock.calls[0];
    assert.deepEqual([call.fn, call.clientId, call.auth], ["code", "softuerino-ios-dev", "none"]);
    const extra = call.extra as { url: string; checks: Record<string, unknown> };
    assert.equal(extra.checks.pkceCodeVerifier, "verifier-pkce");
    assert.ok(extra.url.startsWith(DEV_REDIRECT));
    assert.equal(new URL(extra.url).searchParams.get("code"), "codice");
  });

  it("refresh della sessione ios-dev con il client di sviluppo (non con softuerino-ios)", async () => {
    const user = await makeUser("d1");
    const { token } = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios-dev", refreshToken: "rt-vecchio" });
    await prisma.session.update({
      where: { token: hash(token) },
      data: { ssoCheckedAt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    setRequest({ bearer: token });
    assert.ok(await getSession());
    assert.deepEqual(openidMock.calls.map((c) => [c.fn, c.clientId, c.auth]), [["refresh", "softuerino-ios-dev", "none"]]);
  });

  it("la sessione ios-dev segue le regole mobili: inattività 30 giorni, non vale come cookie web", async () => {
    const user = await makeUser("d1");
    const { token } = await issueSessionToken(user.id, { authMethod: "oidc", client: "ios-dev" });
    await prisma.session.update({
      where: { token: hash(token) },
      data: { lastSeenAt: new Date(Date.now() - 20 * DAY) },
    });
    setRequest({ bearer: token });
    assert.ok(await getSession());
    setRequest({ cookie: [SESSION_COOKIE_NAME, token] });
    assert.equal(await getSession(), null);
  });

  it("logout: revoca la sessione ios-dev (204) e poi 401", async () => {
    await makeUser("d1");
    const body = await (await mobileTokenLogin(bodyFor(DEV_REDIRECT), exchangeSpy())).json();
    setRequest({ bearer: body.token });
    const out = await postLogout(
      new Request("https://time.test/api/mobile/v1/auth/logout", { method: "POST" })
    );
    assert.equal(out.status, 204);
    assert.equal(await prisma.session.count({ where: { token: hash(body.token) } }), 0);
  });

  it("il back-channel logout accetta anche il client di sviluppo", () => {
    assert.deepEqual(backchannelAudiences(), ["softuerino", "softuerino-ios", "softuerino-ios-dev"]);
  });
});
