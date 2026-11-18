// Eseguire con un DB di prova (mai quello di produzione):
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx tsx --test tests/mobile-auth.test.ts
import { openidMock, setRequest } from "./helpers/next-stubs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { OidcError, MOBILE_REDIRECT_URI, exchangeCode } from "../src/lib/auth/oidc";
import { mobileTokenLogin } from "../src/lib/mobile/login";
import { POST as postLogout } from "../src/app/api/mobile/v1/auth/logout/route";
import { POST as postToken } from "../src/app/api/mobile/v1/auth/token/route";
import { GET as getMe } from "../src/app/api/mobile/v1/me/route";

process.env.OIDC_ISSUER = "https://sso.test/realms/x";
process.env.OIDC_CLIENT_ID = "softuerino";
process.env.OIDC_CLIENT_SECRET = "segreto-di-prova";
process.env.OIDC_REDIRECT_URI = "https://time.test/api/auth/oidc/callback";
process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
delete process.env.MOBILE_OIDC_CLIENT_ID;
delete process.env.OIDC_ALLOWED_GROUP;

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const req = (path: string, body?: unknown) =>
  new Request(`https://time.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const goodBody = { code: "codice", codeVerifier: "v".repeat(50), redirectUri: MOBILE_REDIRECT_URI };

const okExchange = (sub: string, email: string, sid = "sid-m") => async () => ({
  claims: { sub, email, email_verified: true, name: "Mario Prova" } as never,
  tokens: { idToken: "idt", refreshToken: "rt-1", sid },
});

async function linkedUser(id: string, active = true) {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@example.test`, passwordHash: "x", role: "membro", active, oidcSubject: `sub-${id}` },
  });
}

describe("login mobile (code + PKCE)", () => {
  beforeEach(async () => {
    await prisma.impersonationLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    openidMock.calls.length = 0;
    setRequest();
  });

  it("redirectUri diverso da quello dell'app → 400 e nessuna chiamata a Keycloak", async () => {
    let called = false;
    const res = await mobileTokenLogin({ ...goodBody, redirectUri: "https://evil.test/cb" }, {
      exchangeCode: async () => {
        called = true;
        throw new Error("non deve essere chiamato");
      },
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "invalid_request");
    assert.equal(called, false);
  });

  it("corpo incompleto o non JSON → 400 (anche dalla route)", async () => {
    assert.equal((await mobileTokenLogin({ code: "x" })).status, 400);
    assert.equal((await mobileTokenLogin(null)).status, 400);
    const res = await postToken(new Request("https://time.test/api/mobile/v1/auth/token", { method: "POST", body: "non json" }));
    assert.equal(res.status, 400);
  });

  it("codice non valido (Keycloak rifiuta) → 401", async () => {
    const res = await mobileTokenLogin(goodBody, {
      exchangeCode: async () => {
        throw new OidcError("failed", "invalid_grant");
      },
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "invalid_grant");
    assert.equal(await prisma.session.count(), 0);
  });

  it("successo: token ios, no-store, utente nel corpo, token valido su /me", async () => {
    const user = await linkedUser("l1");
    const res = await mobileTokenLogin(goodBody, { exchangeCode: okExchange(`sub-l1`, user.email) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    const body = await res.json();
    assert.equal(typeof body.token, "string");
    assert.ok(new Date(body.expiresAt).getTime() > Date.now());
    assert.equal(body.user.id, user.id);
    assert.ok(!/passwordHash|oidcSubject|refresh/i.test(JSON.stringify(body.user)));

    const row = await prisma.session.findUnique({ where: { token: hash(body.token) } });
    assert.equal(row?.client, "ios");
    assert.equal(row?.authMethod, "oidc");
    assert.equal(row?.oidcSid, "sid-m");
    assert.ok(row?.refreshToken && !row.refreshToken.includes("rt-1")); // solo cifrato
    assert.equal(row?.idToken, null); // l'id_token non serve all'app: non si conserva

    setRequest({ bearer: body.token });
    assert.equal((await getMe(new Request("https://time.test/api/mobile/v1/me"))).status, 200);
  });

  it("utente non attivo → 403 senza sessione", async () => {
    const user = await linkedUser("l2", false);
    const res = await mobileTokenLogin(goodBody, { exchangeCode: okExchange("sub-l2", user.email) });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "inactive");
    assert.equal(await prisma.session.count(), 0);
  });

  it("utente senza primo accesso web (non collegato) → 403, nessun collegamento né creazione", async () => {
    const existing = await prisma.user.create({
      data: { id: "n1", name: "N1", email: "n1@example.test", passwordHash: "x", role: "membro" },
    });
    const res = await mobileTokenLogin(goodBody, { exchangeCode: okExchange("sub-nuovo", existing.email) });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, "first_login_required");
    assert.equal((await prisma.user.findUnique({ where: { id: "n1" } }))?.oidcSubject, null);

    const res2 = await mobileTokenLogin(goodBody, { exchangeCode: okExchange("sub-sconosciuto", "sconosciuto@example.test") });
    assert.equal(res2.status, 403);
    assert.equal(await prisma.user.count({ where: { email: "sconosciuto@example.test" } }), 0);
    assert.equal(await prisma.session.count(), 0);
  });

  it("super admin: il token si emette anche dal pubblico (nessun 403), ma da lì la sessione vale da admin", async () => {
    const admin = await prisma.user.create({
      data: { id: "sa1", name: "SA1", email: "sa1@example.test", passwordHash: "x", role: "super_admin", oidcSubject: "sub-sa1" },
    });
    setRequest({ headers: { "x-softuerino-network": "public" } });
    const fromPublic = await mobileTokenLogin(goodBody, { exchangeCode: okExchange("sub-sa1", admin.email) });
    assert.equal(fromPublic.status, 200);
    const { token, user: loginUser } = await fromPublic.json();
    assert.equal(await prisma.session.count(), 1);
    // il ruolo del login è quello effettivo: dal pubblico admin (non super_admin)
    assert.equal(loginUser.role, "admin");
    // con quel token, dal pubblico: admin; da una rete fidata: super admin
    setRequest({ bearer: token, headers: { "x-real-ip": "192.168.40.142", "x-softuerino-network": "public" } });
    const meBody = await (await getMe(new Request("https://time.test/api/mobile/v1/me"))).json();
    assert.equal(meBody.superAdminActive, false);
    assert.equal(meBody.role, loginUser.role, "/auth/token e /me dicono lo stesso ruolo");
    setRequest({ bearer: token, headers: { "x-real-ip": "192.168.11.5" } });
    assert.equal((await (await getMe(new Request("https://time.test/api/mobile/v1/me"))).json()).superAdminActive, true);
  });

  it("un admin (non super) dal percorso pubblico ottiene il token", async () => {
    await prisma.user.create({
      data: { id: "ad1", name: "AD1", email: "ad1@example.test", passwordHash: "x", role: "admin", oidcSubject: "sub-ad1" },
    });
    setRequest({ headers: { "x-softuerino-network": "public" } });
    const res = await mobileTokenLogin(goodBody, { exchangeCode: okExchange("sub-ad1", "ad1@example.test") });
    assert.equal(res.status, 200);
  });

  it("logout: revoca il token (204), poi 401; senza Bearer 401", async () => {
    const user = await linkedUser("l3");
    const body = await (await mobileTokenLogin(goodBody, { exchangeCode: okExchange("sub-l3", user.email) })).json();
    setRequest({ bearer: body.token });
    const out = await postLogout(req("/api/mobile/v1/auth/logout"));
    assert.equal(out.status, 204);
    assert.equal(await prisma.session.count({ where: { token: hash(body.token) } }), 0);
    assert.equal((await getMe(new Request("https://time.test/api/mobile/v1/me"))).status, 401);
    setRequest();
    assert.equal((await postLogout(req("/api/mobile/v1/auth/logout"))).status, 401);
  });
});

describe("exchangeCode (client mobile pubblico)", () => {
  beforeEach(() => {
    openidMock.calls.length = 0;
  });

  it("usa il client softuerino-ios senza secret, il verifier PKCE e il redirectUri dell'app", async () => {
    openidMock.codeImpl = async () => ({
      id_token: "idt",
      refresh_token: "rt",
      claims: () => ({ sub: "s", sid: "sid-x" }),
    });
    const out = await exchangeCode("codice", "verifier-pkce", MOBILE_REDIRECT_URI);
    assert.equal(out.claims.sub, "s");
    assert.equal(out.tokens.sid, "sid-x");
    const call = openidMock.calls[0];
    assert.deepEqual([call.fn, call.clientId, call.auth], ["code", "softuerino-ios", "none"]);
    const extra = call.extra as { url: string; checks: Record<string, unknown> };
    assert.equal(extra.checks.pkceCodeVerifier, "verifier-pkce");
    assert.equal(new URL(extra.url).searchParams.get("code"), "codice");
    assert.ok(extra.url.startsWith(MOBILE_REDIRECT_URI));
  });

  it("il redirect URI dell'app è quello registrato sul client", () => {
    assert.equal(MOBILE_REDIRECT_URI, "https://time.colibrivision.it/mobile/oauth/callback");
  });

  it("errore di Keycloak → OidcError('failed')", async () => {
    openidMock.codeImpl = async () => {
      throw new Error("invalid_grant");
    };
    await assert.rejects(exchangeCode("x", "y", MOBILE_REDIRECT_URI), (e: unknown) => e instanceof OidcError && e.code === "failed");
  });
});
