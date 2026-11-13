// Task dell'app: service (src/lib/services/tasks.ts) e route /v1/tasks. Solo DB di prova in /tmp:
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx tsx --test tests/mobile-tasks.test.ts
import { setRequest } from "./helpers/next-stubs";
import { cacheCalls, resetCacheCalls } from "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { issueSessionToken } from "../src/lib/auth/session";
import { GET as getTasks, POST as postTask } from "../src/app/api/mobile/v1/tasks/route";
import { GET as getTask, PUT as putTask, DELETE as deleteTask } from "../src/app/api/mobile/v1/tasks/[id]/route";
import { POST as postStatus } from "../src/app/api/mobile/v1/tasks/[id]/status/route";
import { GET as getOptions } from "../src/app/api/mobile/v1/tasks/options/route";
import { createTask } from "../src/lib/services/tasks";

const URL_BASE = "https://time.test/api/mobile/v1";
const send = (method: string, path: string, body?: unknown) =>
  new Request(`${URL_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

async function makeUser(id: string, extra: { role?: string; projectManager?: boolean } = {}) {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@tasks.test`, passwordHash: "x", role: extra.role ?? "membro", active: true, projectManager: extra.projectManager ?? false },
  });
}
async function login(userId: string) {
  const { token } = await issueSessionToken(userId, { authMethod: "oidc", client: "ios" });
  setRequest({ bearer: token });
}
async function makeTask(id: string, completedDaysAgo: number | null, assigneeIds: string[]) {
  return prisma.task.create({
    data: {
      id,
      title: id,
      status: completedDaysAgo === null ? "in_progress" : "done",
      completedAt: completedDaysAgo === null ? null : daysAgo(completedDaysAgo),
      assignees: { create: assigneeIds.map((userId) => ({ userId })) },
    },
  });
}
const idsOf = (body: { tasks: { id: string }[] }) => body.tasks.map((t) => t.id).sort();

describe("task dell'app", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.impersonationLog.deleteMany();
    await prisma.task.deleteMany();
    await prisma.client.deleteMany({ where: { id: { in: ["cl-t", "cl-on", "cl-off"] } } });
    await prisma.userDepartment.deleteMany();
    await prisma.department.deleteMany({ where: { name: { startsWith: "T-" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@tasks.test" } } });
    setRequest();
    resetCacheCalls();
  });

  it("senza Bearer tutte le route rispondono 401 JSON", async () => {
    const responses = [
      await getTasks(send("GET", "/tasks")),
      await postTask(send("POST", "/tasks", {})),
      await getTask(send("GET", "/tasks/x"), idCtx("x")),
      await putTask(send("PUT", "/tasks/x", {}), idCtx("x")),
      await deleteTask(send("DELETE", "/tasks/x"), idCtx("x")),
      await postStatus(send("POST", "/tasks/x/status", {}), idCtx("x")),
      await getOptions(send("GET", "/tasks/options")),
    ];
    for (const res of responses) {
      assert.equal(res.status, 401);
      assert.equal((await res.json()).error, "unauthorized");
    }
    assert.equal(cacheCalls.after, 0);
  });

  it("membro view=archive → 403, anche se è assegnatario di task archiviati", async () => {
    await makeUser("m1");
    await makeTask("vecchio-m1", 31, ["m1"]);
    await login("m1");
    const res = await getTasks(send("GET", "/tasks?view=archive"));
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, "forbidden");
    assert.equal(JSON.stringify(body).includes("vecchio-m1"), false);
  });

  it("responsabile vede in archivio solo i suoi reparti; PM e admin vedono tutto", async () => {
    const it_ = await prisma.department.create({ data: { name: "T-IT" } });
    const com = await prisma.department.create({ data: { name: "T-COM" } });
    for (const id of ["r-it", "m-it", "m-com", "pm1", "adm"]) {
      await makeUser(id, { role: id === "adm" ? "admin" : "membro", projectManager: id === "pm1" });
    }
    await prisma.userDepartment.create({ data: { userId: "r-it", departmentId: it_.id, isManager: true } });
    await prisma.userDepartment.create({ data: { userId: "m-it", departmentId: it_.id } });
    await prisma.userDepartment.create({ data: { userId: "m-com", departmentId: com.id } });
    await makeTask("a-it", 31, ["m-it"]);
    await makeTask("a-com", 31, ["m-com"]);

    await login("r-it");
    let res = await getTasks(send("GET", "/tasks?view=archive"));
    assert.equal(res.status, 200);
    assert.deepEqual(idsOf(await res.json()), ["a-it"]);

    for (const who of ["pm1", "adm"]) {
      await login(who);
      res = await getTasks(send("GET", "/tasks?view=archive"));
      assert.equal(res.status, 200);
      assert.deepEqual(idsOf(await res.json()), ["a-com", "a-it"]);
    }
  });

  it("done da 31 giorni: in archive, non in done; da 29: in done", async () => {
    await makeUser("adm2", { role: "admin" });
    await makeUser("m2");
    await makeTask("d31", 31, ["m2"]);
    await makeTask("d29", 29, ["m2"]);
    await makeTask("att", null, ["m2"]);
    await login("adm2");
    const arch = await (await getTasks(send("GET", "/tasks?view=archive"))).json();
    const done = await (await getTasks(send("GET", "/tasks?view=done"))).json();
    const active = await (await getTasks(send("GET", "/tasks?view=active"))).json();
    assert.deepEqual(idsOf(arch), ["d31"]);
    assert.deepEqual(idsOf(done), ["d29"]);
    assert.deepEqual(idsOf(active), ["att"]);
  });

  it("senza user: il membro parte dai propri task; user=all li mostra tutti; vista non valida → 400", async () => {
    await makeUser("m3");
    await makeUser("m4");
    await makeTask("mio", null, ["m3"]);
    await makeTask("altrui", null, ["m4"]);
    await login("m3");
    assert.deepEqual(idsOf(await (await getTasks(send("GET", "/tasks"))).json()), ["mio"]);
    assert.deepEqual(idsOf(await (await getTasks(send("GET", "/tasks?user=all"))).json()), ["altrui", "mio"]);
    assert.equal((await getTasks(send("GET", "/tasks?view=boh"))).status, 400);
  });

  it("POST crea con assegnatari: 201, notify una sola volta (dopo il successo)", async () => {
    await makeUser("m5");
    await makeUser("m6");
    await prisma.client.create({ data: { id: "cl-t", name: "Cliente T" } });
    await login("m5");
    const res = await postTask(send("POST", "/tasks", { title: "Nuovo", clientId: "cl-t", assigneeIds: ["m6", "m6"], priority: "high", dueDate: "2027-02-03" }));
    assert.equal(res.status, 201);
    const { task } = await res.json();
    assert.equal(task.title, "Nuovo");
    assert.equal(task.status, "not_started");
    assert.deepEqual(task.assignees.map((a: { id: string }) => a.id), ["m6"]);
    assert.equal(task.client.id, "cl-t");
    assert.equal(task.dueDate, "2027-02-03");
    assert.equal(cacheCalls.after, 1);
    assert.ok(cacheCalls.revalidated.includes("/task"));
  });

  it("il service: notify avvisa gli assegnatari una volta sola, e nessuno se non ce ne sono", async () => {
    await makeUser("m7");
    await makeUser("m8");
    const calls: string[][] = [];
    const deps = { notifyTaskAssigned: async (_t: string, ids: string[]) => void calls.push(ids) };
    const actor = { id: "m7", role: "membro", projectManager: false };
    const a = await createTask(actor, { title: "x", assigneeIds: ["m8"] }, deps);
    assert.equal(calls.length, 0, "la creazione non manda nulla da sola");
    await a.notify();
    assert.deepEqual(calls, [["m8"]]);
    const b = await createTask(actor, { title: "y" }, deps);
    await b.notify();
    assert.equal(calls.length, 1);
  });

  it("title vuoto → 400, stato o priorità non validi → 400, cliente o persona inesistenti → 400; nessun task scritto", async () => {
    await makeUser("m9");
    await login("m9");
    for (const body of [{ title: "  " }, { title: "x", status: "boh" }, { title: "x", priority: "urgentissima" }, { title: "x", dueDate: "3/2/2027" }, { title: "x", clientId: "non-esiste" }, { title: "x", assigneeIds: ["non-esiste"] }]) {
      const res = await postTask(send("POST", "/tasks", body));
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal(await prisma.task.count(), 0);
  });

  it("PUT su un task done non cambia completedAt; fuori da done lo azzera", async () => {
    await makeUser("m10");
    const old = daysAgo(3);
    await prisma.task.create({ data: { id: "t-done", title: "t", status: "done", completedAt: old } });
    await login("m10");
    let res = await putTask(send("PUT", "/tasks/t-done", { title: "t2", status: "done" }), idCtx("t-done"));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).task.completedAt, old.toISOString());
    res = await putTask(send("PUT", "/tasks/t-done", { title: "t2", status: "in_progress" }), idCtx("t-done"));
    assert.equal((await res.json()).task.completedAt, null);
    assert.equal((await putTask(send("PUT", "/tasks/nope", { title: "t" }), idCtx("nope"))).status, 404);
  });

  it("PUT: notify solo per gli assegnatari aggiunti", async () => {
    await makeUser("m11");
    await makeUser("m12");
    await makeUser("m13");
    await makeTask("t-up", null, ["m12"]);
    await login("m11");
    const res = await putTask(send("PUT", "/tasks/t-up", { title: "t-up", status: "in_progress", assigneeIds: ["m12", "m13"] }), idCtx("t-up"));
    assert.equal(res.status, 200);
    assert.equal(cacheCalls.after, 1);
    assert.deepEqual((await prisma.taskAssignee.findMany({ where: { taskId: "t-up" } })).map((a) => a.userId).sort(), ["m12", "m13"]);
  });

  it("status done imposta completedAt; status non valido → 400; task inesistente → 404", async () => {
    await makeUser("m14");
    await makeTask("t-st", null, []);
    await login("m14");
    let res = await postStatus(send("POST", "/tasks/t-st/status", { status: "done" }), idCtx("t-st"));
    assert.equal(res.status, 200);
    const { task } = await res.json();
    assert.equal(task.status, "done");
    assert.ok(task.completedAt);
    res = await postStatus(send("POST", "/tasks/t-st/status", { status: "not_started" }), idCtx("t-st"));
    assert.equal((await res.json()).task.completedAt, null);
    assert.equal((await postStatus(send("POST", "/tasks/t-st/status", { status: "boh" }), idCtx("t-st"))).status, 400);
    assert.equal((await postStatus(send("POST", "/tasks/zz/status", { status: "done" }), idCtx("zz"))).status, 404);
  });

  it("DELETE → 204, poi GET → 404 e DELETE → 404", async () => {
    await makeUser("m15");
    await makeTask("t-del", null, []);
    await login("m15");
    const res = await deleteTask(send("DELETE", "/tasks/t-del"), idCtx("t-del"));
    assert.equal(res.status, 204);
    assert.equal((await getTask(send("GET", "/tasks/t-del"), idCtx("t-del"))).status, 404);
    assert.equal((await deleteTask(send("DELETE", "/tasks/t-del"), idCtx("t-del"))).status, 404);
  });

  it("impersonificazione: lettura sì, scrittura → 403 e nulla cambia", async () => {
    await makeUser("adm3", { role: "admin" });
    await makeUser("m16");
    await makeTask("t-imp", null, ["m16"]);
    await login("adm3");
    await prisma.session.updateMany({ where: { userId: "adm3" }, data: { impersonatedUserId: "m16" } });
    assert.equal((await getTasks(send("GET", "/tasks"))).status, 200);
    assert.equal((await postTask(send("POST", "/tasks", { title: "no" }))).status, 403);
    assert.equal((await putTask(send("PUT", "/tasks/t-imp", { title: "no" }), idCtx("t-imp"))).status, 403);
    assert.equal((await postStatus(send("POST", "/tasks/t-imp/status", { status: "done" }), idCtx("t-imp"))).status, 403);
    assert.equal((await deleteTask(send("DELETE", "/tasks/t-imp"), idCtx("t-imp"))).status, 403);
    const t = await prisma.task.findUnique({ where: { id: "t-imp" } });
    assert.equal(t?.title, "t-imp");
    assert.equal(t?.status, "in_progress");
    assert.equal(cacheCalls.after, 0);
  });

  it("options: clienti e persone attivi, canViewArchive per ruolo", async () => {
    await makeUser("m17");
    await makeUser("pm2", { projectManager: true });
    await prisma.client.create({ data: { id: "cl-on", name: "Attivo", active: true } });
    await prisma.client.create({ data: { id: "cl-off", name: "Spento", active: false } });
    await login("m17");
    let body = await (await getOptions(send("GET", "/tasks/options"))).json();
    assert.equal(body.canViewArchive, false);
    assert.deepEqual(body.clients.map((c: { id: string }) => c.id), ["cl-on"]);
    assert.ok(body.users.some((u: { id: string }) => u.id === "m17"));
    await login("pm2");
    body = await (await getOptions(send("GET", "/tasks/options"))).json();
    assert.equal(body.canViewArchive, true);
  });
});
