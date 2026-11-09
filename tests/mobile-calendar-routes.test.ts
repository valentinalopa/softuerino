// Route mobili del calendario: auth Bearer, validazione dei parametri, intestazioni
// e forma del corpo. I permessi fini sono già testati sui service.
import { setRequest } from "./helpers/next-stubs";
import { cacheCalls, resetCacheCalls } from "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { issueSessionToken } from "../src/lib/auth/session";
import { GET as getCalendar } from "../src/app/api/mobile/v1/calendar/route";
import { GET as getUpcoming } from "../src/app/api/mobile/v1/calendar/upcoming/route";
import { GET as getTeam } from "../src/app/api/mobile/v1/team-calendar/route";
import { POST as postEvent } from "../src/app/api/mobile/v1/events/route";
import {
  GET as getOne,
  PATCH as patchOne,
  DELETE as deleteOne,
} from "../src/app/api/mobile/v1/events/[id]/route";

const URL_BASE = "https://time.test/api/mobile/v1";
const get = (path: string) => new Request(`${URL_BASE}${path}`);
const send = (method: string, path: string, body?: unknown) =>
  new Request(`${URL_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeUser(id: string, role = "membro") {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@example.test`, passwordHash: "x", role, active: true },
  });
}
async function login(userId: string) {
  const { token } = await issueSessionToken(userId, { authMethod: "oidc", client: "ios" });
  setRequest({ bearer: token });
}
function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

describe("route mobili del calendario", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.calendarEvent.deleteMany({ where: { createdBy: { email: { endsWith: "@cal-routes.test" } } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    setRequest();
    resetCacheCalls();
  });

  it("senza Bearer tutte le route rispondono 401 JSON", async () => {
    const q = "?from=2026-11-01&to=2026-11-10";
    const responses = await Promise.all([
      getCalendar(get(`/calendar${q}`)),
      getUpcoming(get("/calendar/upcoming")),
      getTeam(get(`/team-calendar${q}`)),
      postEvent(send("POST", "/events", {})),
      getOne(get("/events/x"), ctx("x")),
      patchOne(send("PATCH", "/events/x", {}), ctx("x")),
      deleteOne(send("DELETE", "/events/x"), ctx("x")),
    ]);
    for (const res of responses) {
      assert.equal(res.status, 401);
      assert.equal(res.headers.get("cache-control"), "private, no-store");
      assert.equal((await res.json()).error, "unauthorized");
    }
  });

  it("date mancanti, sbagliate o periodo > 62 giorni → 400 invalid_request", async () => {
    const user = await makeUser("rc1");
    await login(user.id);
    const bad = [
      "",
      "?from=2026-11-01",
      "?from=01/11/2026&to=2026-11-10",
      "?from=2026-02-30&to=2026-03-10",
      "?from=2026-11-10&to=2026-11-01",
      "?from=2026-01-01&to=2026-03-04", // 63 giorni
    ];
    for (const q of bad) {
      for (const path of ["/calendar", "/team-calendar"]) {
        const res = await (path === "/calendar" ? getCalendar : getTeam)(get(path + q));
        assert.equal(res.status, 400, `${path}${q}`);
        const body = await res.json();
        assert.equal(body.error, "invalid_request");
        assert.equal(typeof body.message, "string");
        assert.equal(res.headers.get("cache-control"), "private, no-store");
      }
    }
  });

  it("from di 3 anni fa con 42 giorni → 200", async () => {
    const user = await makeUser("rc2");
    await login(user.id);
    const from = addDays(new Date(), -3 * 365);
    const to = addDays(from, 41);
    const res = await getCalendar(get(`/calendar?from=${ymd(from)}&to=${ymd(to)}`));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ["absences", "events", "presences"]);
    const team = await getTeam(get(`/team-calendar?from=${ymd(from)}&to=${ymd(to)}`));
    assert.equal(team.status, 200);
  });

  it("upcoming: 200 con solo l'elenco events", async () => {
    const user = await makeUser("rc3");
    await login(user.id);
    const res = await getUpcoming(get("/calendar/upcoming"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { events: [] });
  });

  it("crea, legge, modifica ed elimina un evento", async () => {
    const user = await makeUser("rc4");
    await login(user.id);
    const start = new Date(Date.now() + 86_400_000);
    const end = new Date(start.getTime() + 3_600_000);
    const created = await postEvent(
      send("POST", "/events", {
        title: "Riunione",
        type: "riunione",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        participantIds: [],
      })
    );
    const createdBody = await created.json();
    assert.equal(created.status, 201, JSON.stringify(createdBody));
    assert.equal(created.headers.get("cache-control"), "private, no-store");
    assert.equal(createdBody.title, "Riunione");
    assert.equal(createdBody.canEdit, true);
    assert.ok(cacheCalls.revalidated.includes("/calendario"));
    assert.equal(cacheCalls.after, 0); // nessun nuovo partecipante: nessun invito
    const id = createdBody.id as string;

    const one = await getOne(get(`/events/${id}`), ctx(id));
    assert.equal(one.status, 200);

    const patched = await patchOne(
      send("PATCH", `/events/${id}`, {
        title: "Riunione 2",
        type: "riunione",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        participantIds: [],
      }),
      ctx(id)
    );
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).title, "Riunione 2");

    const del = await deleteOne(send("DELETE", `/events/${id}`), ctx(id));
    assert.equal(del.status, 204);
    const gone = await getOne(get(`/events/${id}`), ctx(id));
    assert.equal(gone.status, 404);
    assert.equal((await gone.json()).error, "not_found");
  });

  it("corpo non JSON o dati evento non validi → 400", async () => {
    const user = await makeUser("rc5");
    await login(user.id);
    const notJson = await postEvent(
      new Request(`${URL_BASE}/events`, { method: "POST", body: "{non json" })
    );
    assert.equal(notJson.status, 400);
    const empty = await postEvent(send("POST", "/events", {}));
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error, "invalid_request");
  });

  it("un membro non modifica né elimina l'evento di un altro → 403", async () => {
    const owner = await makeUser("rc6");
    const other = await makeUser("rc7");
    await login(owner.id);
    const start = new Date(Date.now() + 86_400_000);
    const created = await postEvent(
      send("POST", "/events", {
        title: "Privato",
        type: "riunione",
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + 3_600_000).toISOString(),
      })
    );
    const { id } = await created.json();
    await login(other.id);
    const del = await deleteOne(send("DELETE", `/events/${id}`), ctx(id));
    assert.equal(del.status, 403);
    assert.equal((await del.json()).error, "forbidden");
  });
});
