// Super admin solo da rete interna fidata (decisione elemento #310). Usa un DB
// di prova SUO (mai quello di produzione):
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx tsx --test tests/super-admin-rete.test.ts
import { setRequest } from "./helpers/headers-stub";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/constants";
import { getAuthContext, requireAdmin, requireSuperAdmin } from "../src/lib/auth/session";
import { isTrustedIp, isTrustedNetwork } from "../src/lib/network";
import { loginAction } from "../src/lib/auth/actions";
import { createUser, deleteLeaveRequest, deleteUser, emptyTaskArchive } from "../src/lib/actions";
import { handleAccountRequest } from "../src/lib/accounts/actions";
import { saveEmailSettings } from "../src/lib/email/actions";
import { updateGeneralRules } from "../src/lib/roles/actions";
import { requestUpdate, requestUpdateCheck } from "../src/lib/system/actions";
import { createVpnSection } from "../src/lib/vpn/actions";
import { accountForViewer } from "../src/lib/licenses/access";
import { encryptSecret } from "../src/lib/crypto/secret-box";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const DAY = 24 * 60 * 60 * 1000;

// Intestazioni come le lascia Nginx: X-Real-IP sempre sovrascritto; sul blocco
// pubblico anche X-Softuerino-Network: public.
const local = (ip: string, extra: Record<string, string> = {}) => ({ "x-real-ip": ip, ...extra });
const publicPath = (extra: Record<string, string> = {}) => ({
  "x-real-ip": "192.168.40.142",
  "x-softuerino-network": "public",
  ...extra,
});

async function userWithSession(id: string, role: string, impersonatedUserId?: string) {
  const user = await prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@example.test`, passwordHash: "x", role },
  });
  const token = `tok-${id}`;
  await prisma.session.create({
    data: {
      userId: user.id,
      token: hash(token),
      expiresAt: new Date(Date.now() + 10 * DAY),
      authMethod: "oidc",
      impersonatedUserId,
    },
  });
  return { user, token };
}

const asRequest = (token: string, headers: Record<string, string>) =>
  setRequest({ headers, cookie: [SESSION_COOKIE_NAME, token] });

async function redirectTarget(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("NEXT_REDIRECT:")) return message.slice("NEXT_REDIRECT:".length);
    throw err;
  }
  return null;
}

describe("isTrustedIp: reti ammesse 192.168.1.0/24, 192.168.11.0/24, 192.168.5.0/24", () => {
  it("reti ammesse", () => {
    for (const ip of ["192.168.1.1", "192.168.1.254", "192.168.11.7", "192.168.5.100", "192.168.5.0"]) {
      assert.equal(isTrustedIp(ip), true, ip);
    }
  });
  it("tutto il resto è escluso, compresi proxy pubblico, Keycloak e le altre VPN", () => {
    for (const ip of [
      "192.168.40.142",
      "192.168.42.46",
      "192.168.7.5",
      "192.168.10.5",
      "192.168.111.5",
      "192.168.2.5",
      "10.0.0.1",
      "8.8.8.8",
      "127.0.0.1",
    ]) {
      assert.equal(isTrustedIp(ip), false, ip);
    }
  });
  it("valori assenti o malformati → non fidato (fail-closed)", () => {
    for (const ip of [
      null,
      undefined,
      "",
      "abc",
      "192.168.1",
      "192.168.1.5.9",
      "192.168.1.256",
      "192.168.1.5, 8.8.8.8",
      "8.8.8.8, 192.168.1.5",
      "::ffff:192.168.1.5",
      "::1",
      "192.168.1.5/24",
    ]) {
      assert.equal(isTrustedIp(ip), false, String(ip));
    }
  });
});

describe("isTrustedNetwork: solo X-Real-IP e blocco non pubblico", () => {
  it("X-Real-IP in una rete ammessa → fidato", async () => {
    for (const ip of ["192.168.1.20", "192.168.11.3", "192.168.5.9"]) {
      setRequest({ headers: local(ip) });
      assert.equal(await isTrustedNetwork(), true, ip);
    }
  });
  it("X-Real-IP mancante → non fidato", async () => {
    setRequest({ headers: {} });
    assert.equal(await isTrustedNetwork(), false);
  });
  it("X-Forwarded-For falsificato → ignorato (anche se punta a una rete ammessa)", async () => {
    setRequest({ headers: { "x-forwarded-for": "192.168.1.5" } });
    assert.equal(await isTrustedNetwork(), false);
    setRequest({ headers: publicPath({ "x-forwarded-for": "192.168.1.5, 192.168.40.142" }) });
    assert.equal(await isTrustedNetwork(), false);
    setRequest({ headers: { "x-real-ip": "8.8.8.8", "x-forwarded-for": "192.168.1.5" } });
    assert.equal(await isTrustedNetwork(), false);
  });
  it("Host falsificato → ignorato", async () => {
    setRequest({ headers: { host: "time.local.colibrivision.it" } });
    assert.equal(await isTrustedNetwork(), false);
    setRequest({ headers: publicPath({ host: "time.local.colibrivision.it" }) });
    assert.equal(await isTrustedNetwork(), false);
  });
  it("blocco pubblico → non fidato anche con un IP interno", async () => {
    setRequest({ headers: local("192.168.1.5", { "x-softuerino-network": "public" }) });
    assert.equal(await isTrustedNetwork(), false);
  });
  it("il proxy pubblico (192.168.40.142) non è mai fidato", async () => {
    setRequest({ headers: { "x-real-ip": "192.168.40.142" } });
    assert.equal(await isTrustedNetwork(), false);
  });
});

describe("getAuthContext: il super admin da fuori rete è un admin", () => {
  beforeEach(async () => {
    await prisma.impersonationLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    setRequest();
  });

  it("dal percorso pubblico: ruolo effettivo admin, poteri da super admin spenti, ruolo nel DB intatto", async () => {
    const { token, user } = await userWithSession("s1", "super_admin");
    asRequest(token, publicPath());
    const ctx = await getAuthContext();
    assert.ok(ctx);
    assert.equal(ctx.realUser.role, "admin");
    assert.equal(ctx.user.role, "admin");
    assert.equal(ctx.hasSuperAdminRole, true);
    assert.equal(ctx.superAdminActive, false);
    assert.equal((await prisma.user.findUnique({ where: { id: user.id } }))?.role, "super_admin");
  });

  it("dal percorso pubblico: i Report (requireAdmin) restano accessibili, requireSuperAdmin no (redirect a /)", async () => {
    const { token } = await userWithSession("s2", "super_admin");
    asRequest(token, publicPath());
    assert.equal(await redirectTarget(() => requireSuperAdmin()), "/");
    assert.equal(await redirectTarget(() => requireAdmin()), null);
    assert.equal((await requireAdmin()).role, "admin");
  });

  it("dal percorso pubblico restano negate le funzioni solo super admin: aggiornamenti, email, ruoli, VPN, svuota archivio, richieste di account, cancellazioni", async () => {
    const { token } = await userWithSession("s2b", "super_admin");
    asRequest(token, publicPath());
    const denied: [string, () => Promise<unknown>][] = [
      ["aggiornamenti", () => requestUpdate()],
      ["controllo aggiornamenti", () => requestUpdateCheck()],
      ["email/SMTP", () => saveEmailSettings(new FormData())],
      ["ruoli e permessi", () => updateGeneralRules(new FormData())],
      ["VPN", () => createVpnSection(new FormData())],
      ["svuota archivio", () => emptyTaskArchive()],
      ["richieste di account", () => handleAccountRequest("x", "done")],
      ["cancella richiesta", () => deleteLeaveRequest("x")],
    ];
    for (const [name, fn] of denied) {
      assert.equal(await redirectTarget(fn), "/", name);
    }
  });

  it("dal percorso pubblico l'admin declassato non gestisce i super admin (come un admin vero)", async () => {
    const { token } = await userWithSession("s2c", "super_admin");
    const target = await prisma.user.create({
      data: { id: "sa-target", name: "SA", email: "sa-target@example.test", passwordHash: "x", role: "super_admin" },
    });
    asRequest(token, publicPath());
    const create = new FormData();
    create.set("name", "Nuovo");
    create.set("email", "nuovo-sa@example.test");
    create.set("role", "super_admin");
    create.set("password", "una-password-lunga-12345");
    assert.match(String((await createUser(create) as { error?: string })?.error), /super admin/i);
    assert.match(String((await deleteUser(target.id) as { error?: string })?.error), /super admin/i);
    assert.ok(await prisma.user.findUnique({ where: { id: target.id } }));
    assert.equal(await prisma.user.count({ where: { email: "nuovo-sa@example.test" } }), 0);
  });

  it("credenziali delle licenze: in chiaro solo con i poteri da super admin attivi", async () => {
    process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const secret = encryptSecret("account-di-prova");
    const { token } = await userWithSession("s2d", "super_admin");
    asRequest(token, publicPath());
    const outside = await getAuthContext();
    assert.equal(accountForViewer(outside!.user, secret), null);
    asRequest(token, local("192.168.11.5"));
    const inside = await getAuthContext();
    assert.equal(accountForViewer(inside!.user, secret), "account-di-prova");
  });

  it("senza X-Real-IP → declassato ad admin (fail-closed)", async () => {
    const { token } = await userWithSession("s3", "super_admin");
    asRequest(token, {});
    const ctx = await getAuthContext();
    assert.equal(ctx?.user.role, "admin");
    assert.equal(ctx?.superAdminActive, false);
  });

  it("X-Forwarded-For falsificato non ridà i poteri", async () => {
    const { token } = await userWithSession("s4", "super_admin");
    asRequest(token, publicPath({ "x-forwarded-for": "192.168.1.5" }));
    assert.equal(await redirectTarget(() => requireSuperAdmin()), "/");
  });

  it("da 192.168.1.0/24, 192.168.11.0/24 e 192.168.5.0/24 → super admin attivo", async () => {
    const { token } = await userWithSession("s5", "super_admin");
    for (const ip of ["192.168.1.30", "192.168.11.2", "192.168.5.44"]) {
      asRequest(token, local(ip));
      const ctx = await getAuthContext();
      assert.equal(ctx?.user.role, "super_admin", ip);
      assert.equal(ctx?.superAdminActive, true, ip);
      assert.equal((await requireSuperAdmin()).role, "super_admin", ip);
      assert.equal((await requireAdmin()).role, "super_admin", ip);
    }
  });

  it("da una rete non ammessa (192.168.7.0/24) → declassato ad admin", async () => {
    const { token } = await userWithSession("s6", "super_admin");
    asRequest(token, local("192.168.7.9"));
    assert.equal((await getAuthContext())?.user.role, "admin");
  });

  it("admin e membro non cambiano con la rete; superAdminActive e hasSuperAdminRole restano falsi", async () => {
    const admin = await userWithSession("a1", "admin");
    const member = await userWithSession("m1", "membro");
    for (const headers of [publicPath(), local("192.168.1.5")]) {
      asRequest(admin.token, headers);
      const a = await getAuthContext();
      assert.equal(a?.user.role, "admin");
      assert.equal(a?.hasSuperAdminRole, false);
      assert.equal(a?.superAdminActive, false);
      asRequest(member.token, headers);
      assert.equal((await getAuthContext())?.user.role, "membro");
    }
  });

  it("impersonificazione: dal pubblico vale come per un admin (può impersonare un membro, in sola lettura)", async () => {
    const target = await prisma.user.create({
      data: { id: "t1", name: "T1", email: "t1@example.test", passwordHash: "x", role: "membro" },
    });
    const { token } = await userWithSession("s7", "super_admin", target.id);
    asRequest(token, publicPath());
    const ctx = await getAuthContext();
    assert.equal(ctx?.impersonating, true);
    assert.equal(ctx?.user.id, "t1");
    assert.equal(ctx?.realUser.role, "admin");
    asRequest(token, local("192.168.11.9"));
    const inside = await getAuthContext();
    assert.equal(inside?.impersonating, true);
    assert.equal(inside?.user.id, "t1");
  });
});

describe("login con password: solo da rete interna fidata", () => {
  const form = (email: string) => {
    const data = new FormData();
    data.set("email", email);
    data.set("password", "una-password-qualsiasi");
    return data;
  };
  beforeEach(() => setRequest());

  it("dal percorso pubblico → rifiutato (local_public)", async () => {
    setRequest({ headers: publicPath() });
    assert.equal(await redirectTarget(() => loginAction(form("x@example.test"))), "/login?error=local_public");
  });
  it("senza X-Real-IP → rifiutato (fail-closed)", async () => {
    setRequest({ headers: {} });
    assert.equal(await redirectTarget(() => loginAction(form("x@example.test"))), "/login?error=local_public");
  });
  it("X-Forwarded-For falsificato → rifiutato", async () => {
    setRequest({ headers: publicPath({ "x-forwarded-for": "192.168.1.5" }) });
    assert.equal(await redirectTarget(() => loginAction(form("x@example.test"))), "/login?error=local_public");
  });
  it("da rete ammessa si prosegue con la verifica della password (utente sconosciuto → error=1)", async () => {
    for (const ip of ["192.168.1.5", "192.168.11.5", "192.168.5.5"]) {
      setRequest({ headers: local(ip) });
      assert.equal(await redirectTarget(() => loginAction(form("nessuno@example.test"))), "/login?error=1", ip);
    }
  });
});
