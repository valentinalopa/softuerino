// Ore dell'app: service (src/lib/services/time.ts) e route /v1/time, /v1/time/{date},
// /v1/time/clients. Solo DB di prova in /tmp (vedi tests/helpers/db-guard.ts):
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx tsx --test tests/mobile-time.test.ts
import { setRequest } from "./helpers/next-stubs";
import { cacheCalls, resetCacheCalls } from "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { issueSessionToken } from "../src/lib/auth/session";
import { GET as getMonthRoute } from "../src/app/api/mobile/v1/time/route";
import { GET as getDayRoute, PUT as putDay } from "../src/app/api/mobile/v1/time/[date]/route";
import { GET as getClients } from "../src/app/api/mobile/v1/time/clients/route";
import { replaceDayFor } from "../src/lib/services/time";

const URL_BASE = "https://time.test/api/mobile/v1";
const send = (method: string, path: string, body?: unknown) =>
  new Request(`${URL_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (date: string) => ({ params: Promise.resolve({ date }) });
const put = (date: string, entries: unknown) => putDay(send("PUT", `/time/${date}`, { entries }), ctx(date));

async function makeUser(id: string, role = "membro") {
  return prisma.user.create({ data: { id, name: `Nome ${id}`, email: `${id}@time.test`, passwordHash: "x", role, active: true } });
}
async function login(userId: string) {
  const { token } = await issueSessionToken(userId, { authMethod: "oidc", client: "ios" });
  setRequest({ bearer: token });
}
async function makeClient(name: string, opts: { active?: boolean; loggers?: string[]; parentId?: string } = {}) {
  return prisma.client.create({
    data: {
      name,
      active: opts.active ?? true,
      parentId: opts.parentId,
      loggers: opts.loggers ? { create: opts.loggers.map((userId) => ({ userId })) } : undefined,
    },
  });
}
const hoursOf = async (userId: string) =>
  (await prisma.timeEntry.findMany({ where: { userId }, orderBy: { hours: "asc" } })).map((e) => e.hours);

describe("ore dell'app", () => {
  let open: { id: string };
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: "@time.test" } } });
    await prisma.client.deleteMany({ where: { name: { startsWith: "TT-" } } });
    open = await makeClient("TT-Aperto");
    setRequest();
    resetCacheCalls();
  });

  it("senza Bearer tutte le route rispondono 401 JSON", async () => {
    for (const res of [
      await getMonthRoute(send("GET", "/time?month=2027-01")),
      await getDayRoute(send("GET", "/time/2027-01-04"), ctx("2027-01-04")),
      await put("2027-01-04", []),
      await getClients(send("GET", "/time/clients")),
    ]) {
      assert.equal(res.status, 401);
      assert.equal((await res.json()).error, "unauthorized");
    }
  });

  it("membro: prima registrazione 200, giorno letto con editable=false, revalidate", async () => {
    await makeUser("m1");
    await login("m1");
    const res = await put("2027-01-04", [{ clientId: open.id, hours: 7.5, note: "  sviluppo  " }]);
    assert.equal(res.status, 200);
    const day = await res.json();
    assert.equal(day.totalHours, 7.5);
    assert.equal(day.editable, false);
    assert.deepEqual(day.entries, [{ clientId: open.id, clientLabel: "TT-Aperto", hours: 7.5, note: "sviluppo" }]);
    assert.ok(cacheCalls.revalidated.includes("/ore"));
    const get = await (await getDayRoute(send("GET", "/time/2027-01-04"), ctx("2027-01-04"))).json();
    assert.deepEqual(get, day);
  });

  it("punto 3: membro che modifica una giornata già registrata → 409, ore invariate; admin → ammesso", async () => {
    await makeUser("m2");
    await login("m2");
    assert.equal((await put("2027-01-05", [{ clientId: open.id, hours: 8 }])).status, 200);
    const again = await put("2027-01-05", [{ clientId: open.id, hours: 4 }]);
    assert.equal(again.status, 409);
    const body = await again.json();
    assert.equal(body.error, "conflict");
    assert.equal(body.message, "Questa giornata è già registrata");
    assert.equal((await put("2027-01-05", [])).status, 409, "neanche svuotarla");
    assert.deepEqual(await hoursOf("m2"), [8]);

    await makeUser("ad", "admin");
    await login("ad");
    assert.equal((await put("2027-01-05", [{ clientId: open.id, hours: 8 }])).status, 200);
    const fix = await put("2027-01-05", [{ clientId: open.id, hours: 6 }]);
    assert.equal(fix.status, 200);
    assert.equal((await fix.json()).editable, true);
    assert.deepEqual(await hoursOf("ad"), [6]);
  });

  it("punto 4: ore su un cliente non ammesso (riservato ad altri o disattivato) → 403, nulla scritto", async () => {
    await makeUser("m3");
    await makeUser("altro");
    const reserved = await makeClient("TT-Riservato", { loggers: ["altro"] });
    const inactive = await makeClient("TT-Chiuso", { active: false });
    await login("m3");
    for (const clientId of [reserved.id, inactive.id, "inesistente"]) {
      const res = await put("2027-01-06", [{ clientId: open.id, hours: 4 }, { clientId, hours: 4 }]);
      assert.equal(res.status, 403, clientId);
      assert.equal((await res.json()).error, "forbidden");
    }
    assert.deepEqual(await hoursOf("m3"), []);
    // A chi è indicato il cliente riservato è ammesso.
    await login("altro");
    assert.equal((await put("2027-01-06", [{ clientId: reserved.id, hours: 4 }])).status, 200);
  });

  it("ore negative, oltre 24 (riga o giorno), non numeriche o clienti doppi → 400", async () => {
    await makeUser("m4");
    const other = await makeClient("TT-Altro");
    await login("m4");
    const bad: unknown[] = [
      [{ clientId: open.id, hours: -1 }],
      [{ clientId: open.id, hours: 25 }],
      [{ clientId: open.id, hours: 13 }, { clientId: other.id, hours: 12 }],
      [{ clientId: open.id, hours: "8" }],
      [{ clientId: open.id, hours: 4 }, { clientId: open.id, hours: 4 }],
      [{ hours: 4 }],
      { clientId: open.id, hours: 4 },
      [{ clientId: open.id, hours: 4, note: "x".repeat(501) }],
    ];
    for (const entries of bad) {
      const res = await put("2027-01-07", entries);
      assert.equal(res.status, 400, JSON.stringify(entries).slice(0, 80));
      assert.equal((await res.json()).error, "invalid_request");
    }
    assert.equal((await put("2027-02-30", [])).status, 400);
    assert.deepEqual(await hoursOf("m4"), []);
    // 24 esatte sono ammesse; le righe a 0 sono ignorate.
    const ok = await put("2027-01-07", [{ clientId: open.id, hours: 12 }, { clientId: other.id, hours: 12 }, { clientId: "zero", hours: 0 }]);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).totalHours, 24);
  });

  it("service: un membro non scrive per altri (403); un admin sì; impersonificazione → 403", async () => {
    await makeUser("m5");
    await makeUser("m6");
    await makeUser("ad2", "admin");
    await assert.rejects(replaceDayFor({ id: "m5", role: "membro" }, "m6", "2027-01-08", []), { status: 403 });
    await assert.rejects(replaceDayFor({ id: "m5", role: "membro", impersonating: true }, "m5", "2027-01-08", []), { status: 403 });
    await replaceDayFor({ id: "ad2", role: "admin" }, "m6", "2027-01-08", [{ clientId: open.id, hours: 3 }]);
    assert.deepEqual(await hoursOf("m6"), [3]);
  });

  it("mese: totale e ore per giorno, solo le proprie; formato non valido → 400", async () => {
    await makeUser("m7");
    await makeUser("m8");
    const mk = (userId: string, d: string, hours: number) =>
      prisma.timeEntry.create({ data: { userId, clientId: open.id, date: new Date(`${d}T00:00:00`), hours, description: "" } });
    await mk("m7", "2027-03-01", 4);
    await mk("m7", "2027-03-01", 3.5);
    await mk("m7", "2027-03-31", 8);
    await mk("m7", "2027-04-01", 8);
    await mk("m8", "2027-03-02", 8);
    await login("m7");
    const body = await (await getMonthRoute(send("GET", "/time?month=2027-03"))).json();
    assert.deepEqual(body, { month: "2027-03", totalHours: 15.5, days: [{ date: "2027-03-01", hours: 7.5 }, { date: "2027-03-31", hours: 8 }] });
    for (const q of ["", "?month=2027-13", "?month=2027-3", "?month=marzo"]) {
      assert.equal((await getMonthRoute(send("GET", `/time${q}`))).status, 400, q);
    }
  });

  it("clienti: solo quelli su cui si può loggare, con etichetta del padre", async () => {
    await makeUser("m9");
    await makeUser("altro2");
    const parent = await makeClient("TT-Padre");
    const child = await makeClient("TT-Voce", { parentId: parent.id, loggers: ["m9"] });
    await makeClient("TT-Riservato2", { loggers: ["altro2"] });
    await makeClient("TT-Chiuso2", { active: false });
    await login("m9");
    const { clients } = await (await getClients(send("GET", "/time/clients"))).json();
    const mine = clients.filter((c: { name: string }) => c.name.startsWith("TT-"));
    const ids = mine.map((c: { id: string }) => c.id).sort();
    assert.deepEqual(ids, [open.id, parent.id, child.id].sort());
    assert.equal(mine.find((c: { id: string }) => c.id === child.id).label.includes("TT-Padre"), true);
  });
});
