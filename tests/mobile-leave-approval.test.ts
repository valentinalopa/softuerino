// Approvazione delle richieste dall'app (F6 T1): service decideLeaveRequest /
// listPendingApprovals e route /v1/leave-requests/pending-approval e
// /v1/leave-requests/{id}/decision. Solo DB di prova in /tmp (tests/helpers/db-guard.ts).
import { setRequest } from "./helpers/next-stubs";
import { cacheCalls, resetCacheCalls } from "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { issueSessionToken } from "../src/lib/auth/session";
import { GET as getPending } from "../src/app/api/mobile/v1/leave-requests/pending-approval/route";
import { POST as postDecision } from "../src/app/api/mobile/v1/leave-requests/[id]/decision/route";
import { decideLeaveRequest } from "../src/lib/services/leave";
import { leaveVersion } from "../src/lib/leave-format";
import { ConflictError } from "../src/lib/services/errors";
import { ForbiddenError } from "../src/lib/task-archive";

const URL_BASE = "https://time.test/api/mobile/v1";
const send = (method: string, path: string, body?: unknown) =>
  new Request(`${URL_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeUser(id: string, role = "membro") {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@approve.test`, passwordHash: "x", role, active: true, employmentType: "dipendente" },
  });
}
async function login(userId: string) {
  const { token } = await issueSessionToken(userId, { authMethod: "oidc", client: "ios" });
  setRequest({ bearer: token });
}
// Reparto col permesso "Approvare" ai responsabili (di default è "no").
async function department(name: string, members: { userId: string; isManager?: boolean }[]) {
  const dep = await prisma.department.create({
    data: { name, permissions: JSON.stringify({ approvare: { responsabile: "reparto" } }) },
  });
  await prisma.userDepartment.createMany({
    data: members.map((m) => ({ userId: m.userId, departmentId: dep.id, isManager: m.isManager ?? false })),
  });
  return dep;
}
async function pending(userId: string, type = "ferie", day = "2026-12-01") {
  return prisma.leaveRequest.create({
    data: { userId, type, startDate: new Date(`${day}T00:00:00`), endDate: new Date(`${day}T00:00:00`), status: "pending" },
  });
}
const decide = (id: string, body: unknown) => postDecision(send("POST", `/leave-requests/${id}/decision`, body), idCtx(id));
const statusOf = async (id: string) => (await prisma.leaveRequest.findUniqueOrThrow({ where: { id } })).status;

describe("approvazione richieste dall'app", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.impersonationLog.deleteMany();
    await prisma.userDepartment.deleteMany({ where: { user: { email: { endsWith: "@approve.test" } } } });
    await prisma.department.deleteMany({ where: { name: { startsWith: "AP-" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@approve.test" } } });
    setRequest();
    resetCacheCalls();
  });

  it("responsabile di più reparti: in pending-approval le richieste di tutti i suoi reparti e solo quelle, senza malattia/104 né proprie", async () => {
    await makeUser("ap-r");
    await makeUser("ap-a");
    await makeUser("ap-b");
    await makeUser("ap-x");
    await department("AP-uno", [{ userId: "ap-r", isManager: true }, { userId: "ap-a" }]);
    await department("AP-due", [{ userId: "ap-r", isManager: true }, { userId: "ap-b" }]);
    await department("AP-tre", [{ userId: "ap-x" }]);
    const a = await pending("ap-a");
    const b = await pending("ap-b");
    await pending("ap-x");
    await pending("ap-r");
    await pending("ap-a", "malattia", "2026-12-05");
    await pending("ap-b", "permesso_104", "2026-12-06");
    await prisma.leaveRequest.create({ data: { userId: "ap-a", type: "ferie", startDate: new Date("2026-12-09T00:00:00"), endDate: new Date("2026-12-09T00:00:00"), status: "approved" } });

    await login("ap-r");
    const res = await getPending(send("GET", "/leave-requests/pending-approval"));
    assert.equal(res.status, 200);
    const { requests } = await res.json();
    assert.deepEqual(requests.map((r: { id: string }) => r.id).sort(), [a.id, b.id].sort());
    const ra = requests.find((r: { id: string }) => r.id === a.id);
    assert.equal(ra.version, leaveVersion(a));
    assert.deepEqual(ra.user, { id: "ap-a", name: "Nome ap-a" });

    // Membro senza permesso: lista vuota.
    await login("ap-a");
    assert.deepEqual((await (await getPending(send("GET", "/leave-requests/pending-approval"))).json()).requests, []);
  });

  it("admin: pending-approval tutte tranne le proprie, malattia e 104 comprese", async () => {
    await makeUser("ap-ad", "admin");
    await makeUser("ap-m");
    const own = await pending("ap-ad");
    const f = await pending("ap-m");
    const s = await pending("ap-m", "malattia", "2026-12-03");
    await login("ap-ad");
    const ids = (await (await getPending(send("GET", "/leave-requests/pending-approval"))).json()).requests.map((r: { id: string }) => r.id);
    assert.ok(ids.includes(f.id) && ids.includes(s.id));
    assert.ok(!ids.includes(own.id));
  });

  it("decisione del responsabile: 200 con la richiesta aggiornata, mail programmata; poi già decisa → 409", async () => {
    await makeUser("ap-r");
    await makeUser("ap-a");
    await department("AP-uno", [{ userId: "ap-r", isManager: true }, { userId: "ap-a" }]);
    const req = await pending("ap-a");
    await login("ap-r");
    resetCacheCalls();
    const res = await decide(req.id, { status: "approved", version: leaveVersion(req) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.request.status, "approved");
    assert.equal(body.request.user.id, "ap-a");
    assert.equal(cacheCalls.after, 1);
    assert.equal(await statusOf(req.id), "approved");

    resetCacheCalls();
    const again = await decide(req.id, { status: "rejected", version: leaveVersion(req) });
    assert.equal(again.status, 409);
    assert.equal(cacheCalls.after, 0);
    assert.equal(await statusOf(req.id), "approved");
  });

  it("propria richiesta → 403 anche per un admin; fuori ambito → 403; inesistente → 404", async () => {
    await makeUser("ap-ad", "admin");
    await makeUser("ap-r");
    await makeUser("ap-x");
    await department("AP-uno", [{ userId: "ap-r", isManager: true }]);
    const own = await pending("ap-ad");
    await login("ap-ad");
    assert.equal((await decide(own.id, { status: "approved", version: leaveVersion(own) })).status, 403);
    assert.equal(await statusOf(own.id), "pending");

    const other = await pending("ap-x");
    await login("ap-r");
    assert.equal((await decide(other.id, { status: "approved", version: leaveVersion(other) })).status, 403);
    assert.equal((await decide("non-esiste", { status: "approved", version: "x" })).status, 404);
    assert.equal(await statusOf(other.id), "pending");
  });

  it("malattia e 104 decise da un non admin → 403; un admin approva la malattia → registrata", async () => {
    await makeUser("ap-r");
    await makeUser("ap-a");
    await makeUser("ap-ad", "admin");
    await department("AP-uno", [{ userId: "ap-r", isManager: true }, { userId: "ap-a" }]);
    const sick = await pending("ap-a", "malattia");
    const p104 = await pending("ap-a", "permesso_104", "2026-12-04");
    await login("ap-r");
    assert.equal((await decide(sick.id, { status: "approved", version: leaveVersion(sick) })).status, 403);
    assert.equal((await decide(p104.id, { status: "rejected", version: leaveVersion(p104) })).status, 403);
    assert.equal(await statusOf(sick.id), "pending");

    await login("ap-ad");
    const res = await decide(sick.id, { status: "approved", version: leaveVersion(sick) });
    assert.equal(res.status, 200);
    assert.equal(await statusOf(sick.id), "registrata");
  });

  it("versione vecchia o assente → 409 «La richiesta è cambiata, ricarica»; ritirata → 404; esito non valido → 400", async () => {
    await makeUser("ap-ad", "admin");
    await makeUser("ap-m");
    const req = await pending("ap-m");
    const oldVersion = leaveVersion(req);
    await prisma.leaveRequest.update({ where: { id: req.id }, data: { endDate: new Date("2026-12-04T00:00:00") } });
    await login("ap-ad");
    let res = await decide(req.id, { status: "approved", version: oldVersion });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).message, "La richiesta è cambiata, ricarica");
    res = await decide(req.id, { status: "approved" });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).message, "La richiesta è cambiata, ricarica");
    assert.equal((await decide(req.id, { status: "forse", version: oldVersion })).status, 400);
    assert.equal(await statusOf(req.id), "pending");

    // Ritirata da chi l'ha fatta: la riga non c'è più.
    await prisma.leaveRequest.delete({ where: { id: req.id } });
    assert.equal((await decide(req.id, { status: "approved", version: oldVersion })).status, 404);
  });

  it("\"vedi come\" (impersonificazione) → 403 e nessuna decisione", async () => {
    await makeUser("ap-ad", "admin");
    await makeUser("ap-r");
    await makeUser("ap-a");
    await department("AP-uno", [{ userId: "ap-r", isManager: true }, { userId: "ap-a" }]);
    const req = await pending("ap-a");
    await login("ap-ad");
    await prisma.session.updateMany({ where: { userId: "ap-ad" }, data: { impersonatedUserId: "ap-r" } });
    assert.equal((await decide(req.id, { status: "approved", version: leaveVersion(req) })).status, 403);
    assert.equal(await statusOf(req.id), "pending");
  });

  it("service: richiesta decisa in contemporanea passa una volta sola; senza requireVersion la versione resta facoltativa (web)", async () => {
    await makeUser("ap-ad", "admin");
    await makeUser("ap-ad2", "admin");
    await makeUser("ap-m");
    const req = await pending("ap-m");
    const actor = (id: string) => ({ id, role: "admin", employmentType: "dipendente" });
    const deps = { notifyLeaveDecision: async () => undefined };
    const results = await Promise.allSettled([
      decideLeaveRequest(actor("ap-ad"), req.id, "approved", undefined, { deps }),
      decideLeaveRequest(actor("ap-ad2"), req.id, "rejected", undefined, { deps }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    assert.ok(failed.reason instanceof ConflictError);
    await assert.rejects(
      decideLeaveRequest({ ...actor("ap-ad"), impersonating: true }, req.id, "approved", undefined, { deps }),
      ForbiddenError
    );
  });
});
