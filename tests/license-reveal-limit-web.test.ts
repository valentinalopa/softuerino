// revealLicenseKey (src/lib/licenses/actions.ts, web): limite giornaliero di 10 rivelazioni.
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx prisma db push
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx tsx --test tests/license-reveal-limit-web.test.ts
process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
import { setRequest } from "./helpers/next-stubs";
import "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/constants";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import { revealLicenseKey } from "../src/lib/licenses/actions";
import { DAILY_REVEAL_LIMIT, romeDayStart } from "../src/lib/licenses/reveal-limit";

const SECRET_KEY = "WEB1-WEB2-WEB3-WEB4";
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const DAY = 24 * 60 * 60 * 1000;

async function makeUser(id: string, role = "admin") {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@lrw.test`, passwordHash: "x", role, active: true },
  });
}
async function loginAs(id: string) {
  const token = `tok-${id}`;
  await prisma.session.create({
    data: { userId: id, token: hash(token), expiresAt: new Date(Date.now() + 10 * DAY), authMethod: "oidc" },
  });
  setRequest({ cookie: [SESSION_COOKIE_NAME, token] });
}
function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
const newUse = (label = "uso") => form({ activationId: "new", label });

let dept: { id: string };
async function makeLicense(name: string) {
  return prisma.license.create({
    data: { name: `LRW-${name}`, departmentId: dept.id, keyEncrypted: encryptSecret(SECRET_KEY), keyHint: "WEB1" },
  });
}
const seed = (userId: string, licenseId: string, n: number, createdAt?: Date) =>
  prisma.licenseKeyAccess.createMany({
    data: Array.from({ length: n }, () => ({ licenseId, userId, action: "show", field: "key", ...(createdAt ? { createdAt } : {}) })),
  });

describe("web: limite giornaliero di rivelazioni", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.licenseKeyAccess.deleteMany({ where: { license: { name: { startsWith: "LRW-" } } } });
    await prisma.license.deleteMany({ where: { name: { startsWith: "LRW-" } } });
    dept = await prisma.department.upsert({ where: { name: "LRW-A" }, create: { name: "LRW-A" }, update: {} });
    setRequest();
  });

  it("la 10ª passa, l'11ª è rifiutata con il messaggio: nessuna riga, nessuna attivazione", async () => {
    await makeUser("lrw1");
    const lic = await makeLicense("a");
    await loginAs("lrw1");
    for (let i = 0; i < DAILY_REVEAL_LIMIT; i++) {
      const r = await revealLicenseKey(lic.id, i % 2 ? "copy" : "show", newUse(`u${i}`));
      assert.deepEqual(r, { key: SECRET_KEY }, `richiesta ${i + 1}`);
    }
    const res = await revealLicenseKey(lic.id, "show", newUse("undicesima"));
    assert.deepEqual(res, { error: "Limite giornaliero di 10 rivelazioni raggiunto" });
    assert.equal(await prisma.licenseKeyAccess.count({ where: { userId: "lrw1" } }), 10);
    assert.equal(await prisma.licenseActivation.count({ where: { licenseId: lic.id } }), 10);
  });

  it("conta anche le righe di altre licenze; quelle di ieri (ora di Roma) no", async () => {
    await makeUser("lrw2");
    const a = await makeLicense("b1");
    const b = await makeLicense("b2");
    await seed("lrw2", b.id, 10);
    await loginAs("lrw2");
    assert.ok("error" in (await revealLicenseKey(a.id, "show", newUse())));

    await makeUser("lrw3");
    await seed("lrw3", b.id, 10, new Date(romeDayStart().getTime() - 60_000));
    await loginAs("lrw3");
    assert.deepEqual(await revealLicenseKey(a.id, "show", newUse()), { key: SECRET_KEY });
  });

  it("super admin escluso", async () => {
    await makeUser("lrw4", "super_admin");
    const lic = await makeLicense("c");
    await seed("lrw4", lic.id, 12);
    await loginAs("lrw4");
    // Fuori dalla rete fidata sarebbe un admin: il test imposta la rete interna.
    setRequest({ cookie: [SESSION_COOKIE_NAME, "tok-lrw4"], headers: { "x-real-ip": "192.168.1.5" } });
    assert.deepEqual(await revealLicenseKey(lic.id, "show", newUse()), { key: SECRET_KEY });
  });
});

describe("romeDayStart", () => {
  it("mezzanotte di Roma, anche nei giorni di cambio d'ora", () => {
    assert.equal(romeDayStart(new Date("2026-11-13T10:00:00Z")).toISOString(), "2026-11-12T23:00:00.000Z"); // CET
    assert.equal(romeDayStart(new Date("2026-07-01T10:00:00Z")).toISOString(), "2026-06-30T22:00:00.000Z"); // CEST
    assert.equal(romeDayStart(new Date("2026-03-29T12:00:00Z")).toISOString(), "2026-03-28T23:00:00.000Z"); // cambio primaverile
    assert.equal(romeDayStart(new Date("2026-10-25T12:00:00Z")).toISOString(), "2026-10-24T22:00:00.000Z"); // cambio autunnale
    // 23:30 UTC del 13/11 sono già le 00:30 del 14 a Roma.
    assert.equal(romeDayStart(new Date("2026-11-13T23:30:00Z")).toISOString(), "2026-11-13T23:00:00.000Z");
  });
});
