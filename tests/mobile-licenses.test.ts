// Licenze dell'app: service (src/lib/services/licenses.ts) e route /v1/licenses. Solo DB di prova in /tmp:
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx prisma db push
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx tsx --test tests/mobile-licenses.test.ts
process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
import { setRequest } from "./helpers/next-stubs";
import "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { issueSessionToken } from "../src/lib/auth/session";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import { GET as getLicenses } from "../src/app/api/mobile/v1/licenses/route";
import { GET as getLicenseById } from "../src/app/api/mobile/v1/licenses/[id]/route";
import { POST as postReveal } from "../src/app/api/mobile/v1/licenses/[id]/reveal/route";

const URL_BASE = "https://time.test/api/mobile/v1";
const SECRET_KEY = "ABCD-EFGH-IJKL-MNOP";
const SECRET_PWD = "pwd-segreta-123";
const SECRET_ACC = "account@esempio.test";
const send = (method: string, path: string, body?: unknown) =>
  new Request(`${URL_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const reveal = (id: string, body: unknown) => postReveal(send("POST", `/licenses/${id}/reveal`, body), ctx(id));

async function makeUser(id: string, role = "membro") {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@lic.test`, passwordHash: "x", role, active: true },
  });
}
async function login(userId: string, headers?: Record<string, string>) {
  const { token } = await issueSessionToken(userId, { authMethod: "oidc", client: "ios" });
  setRequest({ bearer: token, headers });
}
// Permesso "Vedere le licenze" ai membri, per reparto (ambito "reparto").
async function grantView(rule: unknown) {
  const rules = JSON.stringify({ licenze_vedere: rule });
  await prisma.permissionSettings.upsert({ where: { id: 1 }, create: { id: 1, rules }, update: { rules } });
}

let deptA: { id: string };

async function makeLicense(name: string, extra: Record<string, unknown> = {}) {
  return prisma.license.create({
    data: {
      name: `LT-${name}`,
      departmentId: deptA.id,
      keyEncrypted: encryptSecret(SECRET_KEY),
      keyHint: "ABCD",
      passwordEncrypted: encryptSecret(SECRET_PWD),
      accountEncrypted: encryptSecret(SECRET_ACC),
      accountHint: "acc",
      ...extra,
    },
  });
}

describe("licenze dell'app", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.impersonationLog.deleteMany();
    await prisma.permissionSettings.deleteMany();
    await prisma.licenseKeyAccess.deleteMany({ where: { license: { name: { startsWith: "LT-" } } } });
    await prisma.license.deleteMany({ where: { name: { startsWith: "LT-" } } });
    deptA = await prisma.department.upsert({ where: { name: "LT-A" }, create: { name: "LT-A" }, update: {} });

    setRequest();
  });

  it("senza Bearer → 401; senza permesso né licenze visibili → 403", async () => {
    setRequest();
    assert.equal((await getLicenses(send("GET", "/licenses"))).status, 401);
    await makeUser("lm1");
    await login("lm1");
    assert.equal((await getLicenses(send("GET", "/licenses"))).status, 403);
  });

  it("GET /licenses: mascherate, nessuna chiave 'Encrypted' né segreto nel JSON", async () => {
    await makeUser("lad1", "admin");
    await makeLicense("elenco", { activationLimit: 3 });
    await login("lad1");
    const res = await getLicenses(send("GET", "/licenses"));
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes("Encrypted"));
    for (const s of [SECRET_KEY, SECRET_PWD, SECRET_ACC]) assert.ok(!text.includes(s));
    const mine = JSON.parse(text).licenses.filter((l: { name: string }) => l.name === "LT-elenco");
    assert.equal(mine.length, 1);
    assert.equal(mine[0].keyMasked, "ABCD************");
    assert.equal(mine[0].accountMasked, "acc********");
    assert.equal(mine[0].hasPassword, true);
    assert.equal(mine[0].activationsUsed, 0);
  });

  it("GET /licenses/{id}: di altro reparto → 404; visibile a tutti → 200", async () => {
    await makeUser("lm2");
    await grantView({ membro: "reparto" });
    const lic = await makeLicense("altro");
    await login("lm2");
    assert.equal((await getLicenseById(send("GET", "/x"), ctx(lic.id))).status, 404);
    const shared = await makeLicense("tutti", { visibleToAll: true });
    const ok = await getLicenseById(send("GET", "/x"), ctx(shared.id));
    assert.equal(ok.status, 200);
    const text = await ok.text();
    assert.ok(!text.includes("Encrypted"));
    assert.ok(!text.includes(SECRET_KEY));
  });

  it("reveal ok: no-store, valore giusto, una riga LicenseKeyAccess; due reveal → due righe", async () => {
    await makeUser("lad2", "admin");
    const lic = await makeLicense("reveal");
    await login("lad2");
    const res = await reveal(lic.id, { action: "show", activationId: "new", label: "PC ufficio" });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(res.headers.get("pragma"), "no-cache");
    const body = await res.json();
    assert.equal(body.value, SECRET_KEY);
    assert.equal(body.field, "key");
    const rows = await prisma.licenseKeyAccess.findMany({ where: { licenseId: lic.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].userId, "lad2");
    assert.equal(rows[0].action, "show");
    assert.equal(rows[0].field, "key");
    assert.equal(rows[0].activationId, body.activationId);
    assert.equal(rows[0].usedFor, "PC ufficio");
    const res2 = await reveal(lic.id, { action: "copy", field: "password", activationId: body.activationId });
    assert.equal(res2.status, 200);
    assert.equal((await res2.json()).value, SECRET_PWD);
    assert.equal(await prisma.licenseKeyAccess.count({ where: { licenseId: lic.id } }), 2);
    assert.equal(await prisma.licenseActivation.count({ where: { licenseId: lic.id } }), 1);
  });

  it("licenza di altro reparto → 403 senza value né keyHint, nessuna riga scritta", async () => {
    await makeUser("lm3");
    await grantView({ membro: "reparto" });
    const lic = await makeLicense("negata");
    await login("lm3");
    const res = await reveal(lic.id, { action: "show", activationId: "new", label: "x" });
    assert.equal(res.status, 403);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    const text = await res.text();
    assert.ok(!text.includes("value") && !text.includes("ABCD") && !text.includes(SECRET_KEY));
    assert.equal(await prisma.licenseKeyAccess.count({ where: { licenseId: lic.id } }), 0);
    assert.equal(await prisma.licenseActivation.count({ where: { licenseId: lic.id } }), 0);
  });

  it("account: stesse regole di chiave e password (accesso alla licenza + attivazione), riga di registro", async () => {
    await makeUser("lad3", "admin");
    await makeUser("lsa1", "super_admin");
    await makeUser("lme3");
    const lic = await makeLicense("account");
    // Admin con accesso → 200 e riga di registro con field=account.
    await login("lad3");
    const adminRes = await reveal(lic.id, { action: "show", field: "account", activationId: "new", label: "x" });
    assert.equal(adminRes.status, 200);
    assert.equal((await adminRes.json()).value, SECRET_ACC);
    const row = await prisma.licenseKeyAccess.findFirstOrThrow({ where: { licenseId: lic.id, userId: "lad3" } });
    assert.equal(row.field, "account");
    // Senza attivazione indicata → 400 anche per l'account.
    const noLabel = await reveal(lic.id, { action: "show", field: "account", activationId: "new" });
    assert.equal(noLabel.status, 400);
    // Utente senza accesso alla licenza → 403, nessun valore, nessuna riga.
    await login("lme3");
    const denied = await reveal(lic.id, { action: "show", field: "account", activationId: "new", label: "z" });
    assert.equal(denied.status, 403);
    assert.ok(!(await denied.text()).includes(SECRET_ACC));
    // Super admin (rete fidata o percorso pubblico, dove è admin) → 200.
    await login("lsa1", { "x-real-ip": "192.168.1.5" });
    assert.equal((await reveal(lic.id, { action: "copy", field: "account", activationId: "new", label: "y" })).status, 200);
    await login("lsa1", { "x-real-ip": "8.8.8.8", "x-softuerino-network": "public" });
    assert.equal((await reveal(lic.id, { action: "copy", field: "account", activationId: "new", label: "w" })).status, 200);
    assert.equal(await prisma.licenseKeyAccess.count({ where: { licenseId: lic.id } }), 3);
  });

  describe("limite giornaliero di 10 rivelazioni", () => {
    const body = (extra: Record<string, unknown> = {}) => ({ action: "show", activationId: "new", label: "uso", ...extra });
    const seed = (userId: string, licenseId: string, n: number, createdAt?: Date) =>
      prisma.licenseKeyAccess.createMany({
        data: Array.from({ length: n }, () => ({
          licenseId,
          userId,
          action: "show",
          field: "key",
          ...(createdAt ? { createdAt } : {}),
        })),
      });

    it("la 10ª passa, l'11ª → 429 no-store senza valore, 0 righe e 0 attivazioni nuove", async () => {
      await makeUser("llm1", "admin");
      const lic = await makeLicense("rl1");
      await login("llm1");
      for (let i = 0; i < 10; i++) {
        const r = await reveal(lic.id, body({ action: i % 2 ? "copy" : "show" }));
        assert.equal(r.status, 200, `richiesta ${i + 1}`);
      }
      const rows = await prisma.licenseKeyAccess.count({ where: { userId: "llm1" } });
      const acts = await prisma.licenseActivation.count({ where: { licenseId: lic.id } });
      const res = await reveal(lic.id, body({ label: "undicesima" }));
      assert.equal(res.status, 429);
      assert.match(res.headers.get("cache-control") ?? "", /no-store/);
      const text = await res.text();
      assert.ok(text.includes("Limite giornaliero di 10 rivelazioni raggiunto"));
      assert.ok(!text.includes(SECRET_KEY));
      assert.equal((JSON.parse(text) as { error: string }).error, "rate_limited");
      assert.equal(await prisma.licenseKeyAccess.count({ where: { userId: "llm1" } }), rows);
      assert.equal(await prisma.licenseActivation.count({ where: { licenseId: lic.id } }), acts);
    });

    it("conta tutte le licenze e anche le righe scritte dal web (show e copy)", async () => {
      await makeUser("llm2", "admin");
      const a = await makeLicense("rl2a");
      const b = await makeLicense("rl2b");
      await seed("llm2", b.id, 10);
      await login("llm2");
      const res = await reveal(a.id, body());
      assert.equal(res.status, 429);
    });

    it("le righe di ieri (ora di Roma) non contano", async () => {
      await makeUser("llm3", "admin");
      const lic = await makeLicense("rl3");
      const { romeDayStart } = await import("../src/lib/licenses/reveal-limit");
      await seed("llm3", lic.id, 10, new Date(romeDayStart().getTime() - 60_000));
      await login("llm3");
      assert.equal((await reveal(lic.id, body())).status, 200);
    });

    it("altri utenti non contano", async () => {
      await makeUser("llm4", "admin");
      await makeUser("llm5", "admin");
      const lic = await makeLicense("rl4");
      await seed("llm5", lic.id, 10);
      await login("llm4");
      assert.equal((await reveal(lic.id, body())).status, 200);
    });

    it("super admin (ruolo effettivo) oltre il limite → 200; dal percorso pubblico è un admin → 429", async () => {
      await makeUser("llsa", "super_admin");
      const lic = await makeLicense("rl5");
      await seed("llsa", lic.id, 12);
      await login("llsa", { "x-real-ip": "192.168.1.5" });
      assert.equal((await reveal(lic.id, body())).status, 200);
      await login("llsa", { "x-real-ip": "8.8.8.8", "x-softuerino-network": "public" });
      assert.equal((await reveal(lic.id, body({ label: "pubblico" }))).status, 429);
    });

    it("tra licenza non accessibile e limite: 403 prima del 429, nessuna riga", async () => {
      await makeUser("llm6");
      const lic = await makeLicense("rl6");
      await seed("llm6", lic.id, 10);
      await login("llm6");
      assert.equal((await reveal(lic.id, body())).status, 403);
    });

    it("concorrenti oltre il limite: non si superano mai le 10 righe", async () => {
      await makeUser("llm7", "admin");
      const lic = await makeLicense("rl7");
      await seed("llm7", lic.id, 9);
      await login("llm7");
      const results = await Promise.all([
        reveal(lic.id, body({ label: "c1" })),
        reveal(lic.id, body({ label: "c2" })),
        reveal(lic.id, body({ label: "c3" })),
      ]);
      const ok = results.filter((r) => r.status === 200).length;
      assert.ok(ok <= 1);
      assert.equal(await prisma.licenseKeyAccess.count({ where: { userId: "llm7" } }), 9 + ok);
      assert.equal(await prisma.licenseActivation.count({ where: { licenseId: lic.id } }), ok);
    });
  });

  it("new oltre il limite → 409 e nessuna riga nuova", async () => {
    await makeUser("lad4", "admin");
    const lic = await makeLicense("limite", { activationLimit: 1 });
    await login("lad4");
    assert.equal((await reveal(lic.id, { action: "show", activationId: "new", label: "uno" })).status, 200);
    const res = await reveal(lic.id, { action: "show", activationId: "new", label: "due" });
    assert.equal(res.status, 409);
    assert.ok(!(await res.text()).includes(SECRET_KEY));
    assert.equal(await prisma.licenseActivation.count({ where: { licenseId: lic.id } }), 1);
    assert.equal(await prisma.licenseKeyAccess.count({ where: { licenseId: lic.id } }), 1);
  });

  it("due new concorrenti con limite 1 → al massimo una attivazione e una riga di registro", async () => {
    await makeUser("lad9", "admin");
    const lic = await makeLicense("concorrenti", { activationLimit: 1 });
    await login("lad9");
    const results = await Promise.all([
      reveal(lic.id, { action: "show", activationId: "new", label: "uno" }),
      reveal(lic.id, { action: "show", activationId: "new", label: "due" }),
    ]);
    const ok = results.filter((r) => r.status === 200).length;
    assert.ok(ok <= 1);
    assert.equal(await prisma.licenseActivation.count({ where: { licenseId: lic.id } }), ok);
    assert.equal(await prisma.licenseKeyAccess.count({ where: { licenseId: lic.id } }), ok);
  });

  it("label vuota o di 121 caratteri → 400, azione/campo non validi → 400, nessuna riga", async () => {
    await makeUser("lad5", "admin");
    const lic = await makeLicense("label");
    await login("lad5");
    assert.equal((await reveal(lic.id, { action: "show", activationId: "new", label: "a".repeat(121) })).status, 400);
    assert.equal((await reveal(lic.id, { action: "show", activationId: "new", label: "  " })).status, 400);
    assert.equal((await reveal(lic.id, { action: "boh", activationId: "new", label: "x" })).status, 400);
    assert.equal((await reveal(lic.id, { action: "show", field: "altro", activationId: "new", label: "x" })).status, 400);
    assert.equal((await reveal(lic.id, { action: "show", activationId: "new", label: "a".repeat(120) })).status, 200);
    assert.equal(await prisma.licenseActivation.count({ where: { licenseId: lic.id } }), 1);
    assert.equal(await prisma.licenseKeyAccess.count({ where: { licenseId: lic.id } }), 1);
  });

  it("activationId di un'altra licenza → 404, nessuna riga", async () => {
    await makeUser("lad6", "admin");
    const a = await makeLicense("a6");
    const b = await makeLicense("b6");
    const act = await prisma.licenseActivation.create({ data: { licenseId: b.id, label: "di B" } });
    await login("lad6");
    const res = await reveal(a.id, { action: "show", activationId: act.id });
    assert.equal(res.status, 404);
    assert.equal(await prisma.licenseKeyAccess.count({ where: { licenseId: a.id } }), 0);
  });

  it("impersonificazione → 403, nessuna riga", async () => {
    await makeUser("lad7", "admin");
    await makeUser("lm7");
    const lic = await makeLicense("imp");
    await login("lad7");
    await prisma.session.updateMany({ where: { userId: "lad7" }, data: { impersonatedUserId: "lm7" } });
    const res = await reveal(lic.id, { action: "show", activationId: "new", label: "x" });
    assert.equal(res.status, 403);
    assert.equal(await prisma.licenseKeyAccess.count({ where: { licenseId: lic.id } }), 0);
  });

  it("dato non salvato → 404; dato non leggibile → 409 senza segreti", async () => {
    await makeUser("lad8", "admin");
    const senzaPwd = await makeLicense("senzapwd", { passwordEncrypted: null });
    const rotta = await makeLicense("rotta", { keyEncrypted: "non-valido" });
    await login("lad8");
    assert.equal((await reveal(senzaPwd.id, { action: "show", field: "password", activationId: "new", label: "x" })).status, 404);
    const res = await reveal(rotta.id, { action: "show", activationId: "new", label: "x" });
    assert.equal(res.status, 409);
    assert.equal(await prisma.licenseKeyAccess.count({ where: { licenseId: rotta.id } }), 0);
  });
});
