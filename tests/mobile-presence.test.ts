// Presenze dell'app: service (src/lib/services/presence.ts) e route PUT/DELETE /v1/presence.
// Solo DB di prova in /tmp (vedi tests/helpers/db-guard.ts):
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx tsx --test tests/mobile-presence.test.ts
import { setRequest } from "./helpers/next-stubs";
import { cacheCalls, resetCacheCalls } from "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { issueSessionToken } from "../src/lib/auth/session";
import { GET as getCalendar } from "../src/app/api/mobile/v1/calendar/route";
import { PUT as putPresence, DELETE as deletePresenceRoute } from "../src/app/api/mobile/v1/presence/route";
import { DELETE as deletePresenceDay } from "../src/app/api/mobile/v1/presence/[date]/route";
import { setPresence, deletePresence } from "../src/lib/services/presence";
import { ForbiddenError } from "../src/lib/task-archive";
import { ValidationError } from "../src/lib/services/errors";

const URL_BASE = "https://time.test/api/mobile/v1";
const send = (method: string, path: string, body?: unknown) =>
  new Request(`${URL_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (date: string) => ({ params: Promise.resolve({ date }) });

async function makeUser(id: string, role = "membro") {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@presence.test`, passwordHash: "x", role, active: true },
  });
}
async function login(userId: string) {
  const { token } = await issueSessionToken(userId, { authMethod: "oidc", client: "ios" });
  setRequest({ bearer: token });
}
async function rows(userId: string) {
  const list = await prisma.presenceEntry.findMany({ where: { userId } });
  return list
    .map((p) => `${p.date.getFullYear()}-${String(p.date.getMonth() + 1).padStart(2, "0")}-${String(p.date.getDate()).padStart(2, "0")} ${p.slot} ${p.mode}`)
    .sort();
}

describe("presenze dell'app", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: "@presence.test" } } });
    setRequest();
    resetCacheCalls();
  });

  it("senza Bearer PUT e DELETE rispondono 401 JSON", async () => {
    const responses = [
      await putPresence(send("PUT", "/presence", {})),
      await deletePresenceRoute(send("DELETE", "/presence", {})),
      await deletePresenceDay(send("DELETE", "/presence/2026-11-20"), ctx("2026-11-20")),
    ];
    for (const res of responses) {
      assert.equal(res.status, 401);
      assert.equal(res.headers.get("cache-control"), "private, no-store");
      assert.equal((await res.json()).error, "unauthorized");
    }
  });

  it("presenza propria: 200, salvata e visibile in GET /v1/calendar", async () => {
    const user = await makeUser("pr1");
    await login(user.id);
    const res = await putPresence(send("PUT", "/presence", { dates: ["2026-11-20"], slot: "mattina", mode: "ufficio" }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await res.json(), { presences: [{ date: "2026-11-20", slot: "mattina", mode: "ufficio" }] });
    assert.deepEqual(await rows(user.id), ["2026-11-20 mattina ufficio"]);
    assert.ok(cacheCalls.revalidated.includes("/calendario"));

    const cal = await getCalendar(new Request(`${URL_BASE}/calendar?from=2026-11-01&to=2026-11-30`));
    assert.equal(cal.status, 200);
    assert.deepEqual((await cal.json()).presences, [{ date: "2026-11-20", slot: "mattina", mode: "ufficio" }]);
  });

  it("più giorni, aggiornamento della modalità e conflitto tra fasce come sul web", async () => {
    const user = await makeUser("pr2");
    await login(user.id);
    await putPresence(send("PUT", "/presence", { dates: ["2026-11-20", "2026-11-23"], slot: "mattina", mode: "ufficio" }));
    await putPresence(send("PUT", "/presence", { dates: ["2026-11-20"], slot: "mattina", mode: "smartworking" }));
    assert.deepEqual(await rows(user.id), ["2026-11-20 mattina smartworking", "2026-11-23 mattina ufficio"]);
    // "giornata_intera" toglie mattina/pomeriggio dello stesso giorno, e viceversa
    await putPresence(send("PUT", "/presence", { dates: ["2026-11-20"], slot: "giornata_intera", mode: "ufficio" }));
    assert.deepEqual(await rows(user.id), ["2026-11-20 giornata_intera ufficio", "2026-11-23 mattina ufficio"]);
    await putPresence(send("PUT", "/presence", { dates: ["2026-11-20"], slot: "pomeriggio", mode: "smartworking" }));
    assert.deepEqual(await rows(user.id), ["2026-11-20 pomeriggio smartworking", "2026-11-23 mattina ufficio"]);
  });

  it("giorno con un'assenza approvata: come sul web, la presenza si registra", async () => {
    const user = await makeUser("pr3");
    await prisma.leaveRequest.create({
      data: {
        userId: user.id,
        type: "ferie",
        status: "approved",
        startDate: new Date("2026-11-24T00:00:00"),
        endDate: new Date("2026-11-24T00:00:00"),
      },
    });
    await login(user.id);
    const res = await putPresence(send("PUT", "/presence", { dates: ["2026-11-24"], slot: "giornata_intera", mode: "ufficio" }));
    assert.equal(res.status, 200);
    assert.deepEqual(await rows(user.id), ["2026-11-24 giornata_intera ufficio"]);
  });

  it("validazione: 400 invalid_request", async () => {
    const user = await makeUser("pr4");
    await login(user.id);
    const ok = { dates: ["2026-11-20"], slot: "mattina", mode: "ufficio" };
    const many = Array.from({ length: 63 }, (_, i) => new Date(Date.UTC(2026, 11, 1 + i)).toISOString().slice(0, 10));
    const bad: unknown[] = [
      { ...ok, slot: "sera" },
      { ...ok, mode: "casa" },
      { ...ok, dates: [] },
      { ...ok, dates: ["20/11/2026"] },
      { ...ok, dates: ["2026-02-30"] },
      { ...ok, dates: "2026-11-20" },
      { ...ok, dates: many },
      { ...ok, dates: [20261120] },
    ];
    for (const body of bad) {
      const res = await putPresence(send("PUT", "/presence", body));
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
      const json = await res.json();
      assert.equal(json.error, "invalid_request");
      assert.ok(typeof json.message === "string" && json.message.length > 0);
    }
    const notObject = await putPresence(send("PUT", "/presence", [1]));
    assert.equal(notObject.status, 400);
    assert.deepEqual(await rows(user.id), []);
  });

  it("DELETE /presence/{date}: senza slot toglie tutte le fasce del giorno, con ?slot solo quella", async () => {
    const user = await makeUser("pr5");
    await login(user.id);
    await putPresence(send("PUT", "/presence", { dates: ["2026-11-20"], slot: "mattina", mode: "ufficio" }));
    await putPresence(send("PUT", "/presence", { dates: ["2026-11-20"], slot: "pomeriggio", mode: "smartworking" }));
    await putPresence(send("PUT", "/presence", { dates: ["2026-11-23"], slot: "mattina", mode: "ufficio" }));
    resetCacheCalls();
    const one = await deletePresenceDay(send("DELETE", "/presence/2026-11-20?slot=mattina"), ctx("2026-11-20"));
    assert.equal(one.status, 204);
    assert.deepEqual(await rows(user.id), ["2026-11-20 pomeriggio smartworking", "2026-11-23 mattina ufficio"]);
    assert.ok(cacheCalls.revalidated.includes("/calendario"));
    const all = await deletePresenceDay(send("DELETE", "/presence/2026-11-20"), ctx("2026-11-20"));
    assert.equal(all.status, 204);
    assert.deepEqual(await rows(user.id), ["2026-11-23 mattina ufficio"]);
    // idempotente: un giorno senza presenze non è un errore
    const none = await deletePresenceDay(send("DELETE", "/presence/2026-12-01"), ctx("2026-12-01"));
    assert.equal(none.status, 204);
  });

  it("DELETE /presence con corpo {dates, slot?}: più giorni; data o fascia sbagliate → 400", async () => {
    const user = await makeUser("pr6");
    await login(user.id);
    await putPresence(send("PUT", "/presence", { dates: ["2026-11-20", "2026-11-23", "2026-11-24"], slot: "mattina", mode: "ufficio" }));
    const res = await deletePresenceRoute(send("DELETE", "/presence", { dates: ["2026-11-20", "2026-11-23"] }));
    assert.equal(res.status, 204);
    assert.deepEqual(await rows(user.id), ["2026-11-24 mattina ufficio"]);
    for (const body of [{ dates: [] }, { dates: ["x"] }, { dates: ["2026-11-24"], slot: "sera" }]) {
      const bad = await deletePresenceRoute(send("DELETE", "/presence", body));
      assert.equal(bad.status, 400);
    }
    const badDay = await deletePresenceDay(send("DELETE", "/presence/ieri"), ctx("ieri"));
    assert.equal(badDay.status, 400);
    const badSlot = await deletePresenceDay(send("DELETE", "/presence/2026-11-24?slot=sera"), ctx("2026-11-24"));
    assert.equal(badSlot.status, 400);
    assert.deepEqual(await rows(user.id), ["2026-11-24 mattina ufficio"]);
  });

  it("agisce solo sul proprio utente: nessun userId accettato, presenze altrui intatte", async () => {
    const me = await makeUser("pr7");
    const other = await makeUser("pr8");
    await prisma.presenceEntry.create({
      data: { userId: other.id, date: new Date("2026-11-20T00:00:00"), slot: "mattina", mode: "ufficio" },
    });
    await login(me.id);
    const res = await putPresence(send("PUT", "/presence", { userId: other.id, dates: ["2026-11-20"], slot: "pomeriggio", mode: "smartworking" }));
    assert.equal(res.status, 200);
    assert.deepEqual(await rows(other.id), ["2026-11-20 mattina ufficio"]);
    assert.deepEqual(await rows(me.id), ["2026-11-20 pomeriggio smartworking"]);
    await deletePresenceDay(send("DELETE", "/presence/2026-11-20"), ctx("2026-11-20"));
    assert.deepEqual(await rows(other.id), ["2026-11-20 mattina ufficio"]);
    assert.deepEqual(await rows(me.id), []);
  });

  it("service: impersonificazione = sola lettura (403); date duplicate si fondono", async () => {
    const user = await makeUser("pr9");
    await assert.rejects(
      setPresence({ id: user.id, role: "admin", impersonating: true }, { dates: ["2026-11-20"], slot: "mattina", mode: "ufficio" }),
      ForbiddenError
    );
    await assert.rejects(deletePresence({ id: user.id, role: "admin", impersonating: true }, { dates: ["2026-11-20"] }), ForbiddenError);
    const out = await setPresence({ id: user.id, role: "membro" }, { dates: ["2026-11-20", "2026-11-20"], slot: "mattina", mode: "ufficio" });
    assert.deepEqual(out, [{ date: "2026-11-20", slot: "mattina", mode: "ufficio" }]);
    await assert.rejects(setPresence({ id: user.id, role: "membro" }, { dates: [], slot: "mattina", mode: "ufficio" }), ValidationError);
  });
});
