// Eseguire con un DB di prova (mai quello di produzione):
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx tsx --test tests/mobile-http.test.ts
import { requestState, setRequest } from "./helpers/next-stubs";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/constants";
import {
  createSession,
  getAuthContext,
  getSession,
  issueSessionToken,
  revokeBearerSession,
} from "../src/lib/auth/session";
import { POST as postLogout } from "../src/app/api/mobile/v1/auth/logout/route";
import { ForbiddenError } from "../src/lib/task-archive";
import { NotFoundError, withMobileAuth } from "../src/lib/mobile/http";
import { GET as getMe } from "../src/app/api/mobile/v1/me/route";
import { proxy } from "../src/proxy";

const req = (path = "/api/mobile/v1/me") => new Request(`https://time.test${path}`);

async function makeUser(id: string, role = "membro", active = true) {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@example.test`, passwordHash: "x", role, active },
  });
}
async function iosToken(userId: string) {
  return (await issueSessionToken(userId, { authMethod: "oidc", client: "ios" })).token;
}

describe("withMobileAuth e GET /me", () => {
  beforeEach(async () => {
    await prisma.impersonationLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.userDepartment.deleteMany();
    await prisma.department.deleteMany({ where: { name: { startsWith: "T-" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    setRequest();
  });

  it("senza header Authorization → 401 JSON (mai redirect)", async () => {
    const res = await getMe(req());
    assert.equal(res.status, 401);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    const body = await res.json();
    assert.equal(typeof body.error, "string");
    assert.equal(typeof body.message, "string");
  });

  it("solo cookie web valido → 401 (il cookie è ignorato)", async () => {
    const user = await makeUser("a1");
    await createSession(user.id, { authMethod: "password" });
    const cookie = requestState.cookies.get(SESSION_COOKIE_NAME)!;
    setRequest({ cookie: [SESSION_COOKIE_NAME, cookie] });
    assert.equal((await getMe(req())).status, 401);
  });

  it("Bearer non valido, anche con cookie web valido → 401", async () => {
    const user = await makeUser("a2");
    await createSession(user.id, { authMethod: "password" });
    const cookie = requestState.cookies.get(SESSION_COOKIE_NAME)!;
    setRequest({ bearer: "sbagliato", cookie: [SESSION_COOKIE_NAME, cookie] });
    assert.equal((await getMe(req())).status, 401);
  });

  it("Bearer valido → 200 con id, name, email, role, managedDepartments", async () => {
    const user = await makeUser("a3");
    const dep = await prisma.department.create({ data: { name: "T-Reparto" } });
    await prisma.userDepartment.create({ data: { userId: user.id, departmentId: dep.id, isManager: true } });
    setRequest({ bearer: await iosToken(user.id) });
    const res = await getMe(req());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await res.json(), {
      id: user.id,
      name: user.name,
      email: user.email,
      role: "membro",
      hasSuperAdminRole: false,
      superAdminActive: false,
      managedDepartments: [{ id: dep.id, name: "T-Reparto" }],
    });
  });

  it("la risposta non contiene passwordHash né token", async () => {
    const user = await makeUser("a4");
    setRequest({ bearer: await iosToken(user.id) });
    const text = await (await getMe(req())).text();
    assert.ok(!/passwordHash|token|oidcSubject/i.test(text));
  });

  it("utente disattivato dopo il login → 401", async () => {
    const user = await makeUser("a5");
    const token = await iosToken(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    setRequest({ bearer: token });
    assert.equal((await getMe(req())).status, 401);
  });

  it("super admin con Bearer: dal pubblico è admin (superAdminActive=false), da 11.0/1.0/5.0 è super admin (true)", async () => {
    const user = await makeUser("a6", "super_admin");
    const token = await iosToken(user.id);
    const publicHeaders = { "x-real-ip": "192.168.40.142", "x-softuerino-network": "public" };
    // dal percorso pubblico: nessun 403, ma ruolo effettivo admin
    setRequest({ bearer: token, headers: publicHeaders });
    const outside = await getMe(req());
    assert.equal(outside.status, 200);
    const outsideBody = await outside.json();
    assert.equal(outsideBody.role, "admin");
    assert.equal(outsideBody.hasSuperAdminRole, true);
    assert.equal(outsideBody.superAdminActive, false);
    // senza X-Real-IP (fail-closed) e con X-Forwarded-For falsificato: ancora admin
    setRequest({ bearer: token, headers: { "x-forwarded-for": "192.168.1.5" } });
    assert.equal((await (await getMe(req())).json()).superAdminActive, false);
    // dalle reti fidate: super admin attivo
    for (const ip of ["192.168.11.5", "192.168.1.9", "192.168.5.7"]) {
      setRequest({ bearer: token, headers: { "x-real-ip": ip } });
      const inside = await getMe(req());
      assert.equal(inside.status, 200);
      const body = await inside.json();
      assert.equal(body.role, "super_admin", ip);
      assert.equal(body.hasSuperAdminRole, true, ip);
      assert.equal(body.superAdminActive, true, ip);
    }
  });

  it("admin: superAdminActive e hasSuperAdminRole restano falsi, da qualsiasi rete", async () => {
    const user = await makeUser("a7", "admin");
    const token = await iosToken(user.id);
    const networks: Record<string, string>[] = [
      { "x-real-ip": "192.168.11.5" },
      { "x-real-ip": "192.168.40.142", "x-softuerino-network": "public" },
    ];
    for (const headers of networks) {
      setRequest({ bearer: token, headers });
      const body = await (await getMe(req())).json();
      assert.equal(body.role, "admin");
      assert.equal(body.hasSuperAdminRole, false);
      assert.equal(body.superAdminActive, false);
    }
  });

  it("admin dal percorso pubblico → 200 (il divieto vale solo per i super admin)", async () => {
    const user = await makeUser("a7", "admin");
    setRequest({ bearer: await iosToken(user.id), headers: { "x-softuerino-network": "public" } });
    assert.equal((await getMe(req())).status, 200);
  });

  it("ForbiddenError → 403, NotFoundError → 404, redirect di Next → 401, errore ignoto → 500 senza dettagli", async () => {
    const user = await makeUser("a8");
    setRequest({ bearer: await iosToken(user.id) });
    const forbidden = await withMobileAuth(async () => {
      throw new ForbiddenError();
    })(req());
    assert.equal(forbidden.status, 403);
    const missing = await withMobileAuth(async () => {
      throw new NotFoundError("Task non trovato");
    })(req());
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).message, "Task non trovato");
    const { redirect } = await import("next/navigation");
    const redirected = await withMobileAuth(async () => redirect("/login"))(req());
    assert.equal(redirected.status, 401);
    const boom = await withMobileAuth(async () => {
      throw new Error("segreto interno");
    })(req());
    assert.equal(boom.status, 500);
    assert.ok(!(await boom.text()).includes("segreto interno"));
  });

  it("un handler che restituisce un oggetto diventa JSON 200; una Response passa invariata", async () => {
    const user = await makeUser("a9");
    setRequest({ bearer: await iosToken(user.id) });
    const ok = await withMobileAuth(async () => ({ ciao: 1 }))(req());
    assert.deepEqual(await ok.json(), { ciao: 1 });
    const empty = await withMobileAuth(async () => new Response(null, { status: 204 }))(req());
    assert.equal(empty.status, 204);
  });
});

describe("proxy: /api/mobile/ esente dal redirect a /login", () => {
  it("senza cookie, /api/mobile/v1/me non viene reindirizzato", () => {
    const res = proxy(new NextRequest("https://time.test/api/mobile/v1/me"));
    assert.equal(res.headers.get("location"), null);
  });
  it("senza cookie, una pagina qualsiasi viene ancora reindirizzata a /login", () => {
    const res = proxy(new NextRequest("https://time.test/impostazioni"));
    assert.equal(res.status, 307);
    assert.match(res.headers.get("location") ?? "", /\/login$/);
  });
  it("un percorso che somiglia soltanto (/api/mobilex) non è esente", () => {
    const res = proxy(new NextRequest("https://time.test/api/mobilex"));
    assert.equal(res.status, 307);
  });
});

describe("header interno del Bearer: lo decide solo il proxy", () => {
  const HEADER = "x-softuerino-mobile";
  const passed = (res: Response) => (res.headers.get("x-middleware-override-headers") ?? "").split(",");
  const sent = (res: Response) => res.headers.get(`x-middleware-request-${HEADER}`);

  beforeEach(async () => {
    await prisma.impersonationLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    setRequest();
  });

  it("sotto /api/mobile/ il proxy imposta l'header a 1, anche se il client ne manda uno diverso", () => {
    const res = proxy(new NextRequest("https://time.test/api/mobile/v1/me", { headers: { [HEADER]: "0" } }));
    assert.equal(sent(res), "1");
  });

  it("header interno falsificato dal client su una pagina web → tolto dal proxy", () => {
    const res = proxy(
      new NextRequest("https://time.test/impostazioni", {
        headers: { [HEADER]: "1", cookie: `${SESSION_COOKIE_NAME}=qualsiasi` },
      })
    );
    assert.ok(!passed(res).includes(HEADER));
    assert.equal(sent(res), null);
  });

  it("header interno falsificato su /api/vpn → tolto dal proxy", () => {
    const res = proxy(
      new NextRequest("https://time.test/api/vpn/x/config", {
        headers: { [HEADER]: "1", cookie: `${SESSION_COOKIE_NAME}=qualsiasi` },
      })
    );
    assert.ok(!passed(res).includes(HEADER));
  });

  it("Bearer valido su una pagina web o in /api/vpn (senza header del proxy) → nessuna sessione", async () => {
    const user = await makeUser("w1");
    const token = await iosToken(user.id);
    setRequest({ bearer: token, mobile: false });
    assert.equal(await getSession(), null);
    assert.equal(await getAuthContext(), null);
    // Stessa richiesta con l'header del proxy: la sessione c'è (prova che il rifiuto è per l'header).
    setRequest({ bearer: token });
    assert.equal((await getSession())?.userId, user.id);
  });

  it("Bearer + cookie web: fuori da /api/mobile/ vale solo il cookie, il Bearer non fa entrare nessuno", async () => {
    const user = await makeUser("w2");
    const token = await iosToken(user.id);
    setRequest({ bearer: token, mobile: false, cookie: [SESSION_COOKIE_NAME, "cookie-inesistente"] });
    assert.equal(await getSession(), null);
  });

  it("revokeBearerSession senza header del proxy non revoca nulla", async () => {
    const user = await makeUser("w3");
    const token = await iosToken(user.id);
    setRequest({ bearer: token, mobile: false });
    assert.equal(await revokeBearerSession(), false);
    assert.equal(await prisma.session.count(), 1);
  });

  it("logout del super admin dal percorso pubblico: consentito (revoca soltanto)", async () => {
    const user = await makeUser("w4", "super_admin");
    const token = await iosToken(user.id);
    setRequest({ bearer: token, headers: { "x-softuerino-network": "public" } });
    const res = await postLogout(new Request("https://time.test/api/mobile/v1/auth/logout", { method: "POST" }));
    assert.equal(res.status, 204);
    assert.equal(await prisma.session.count(), 0);
  });
});
