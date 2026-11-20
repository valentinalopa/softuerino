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

  it("super admin: le sue richieste compaiono in pending-approval e può approvarle (200, mail); admin e responsabile no (403)", async () => {
    await makeUser("ap-sa", "super_admin");
    await makeUser("ap-ad", "admin");
    await makeUser("ap-r");
    await department("AP-uno", [{ userId: "ap-r", isManager: true }]);
    const ownSa = await pending("ap-sa");
    const ownAd = await pending("ap-ad", "ferie", "2026-12-02");
    const ownR = await pending("ap-r", "ferie", "2026-12-03");

    // Il ruolo effettivo di super admin esiste solo dalle reti fidate; dal pubblico vale admin (divieto).
    const { token: saToken } = await issueSessionToken("ap-sa", { authMethod: "oidc", client: "ios" });
    setRequest({ bearer: saToken, headers: { "x-real-ip": "192.168.40.142", "x-softuerino-network": "public" } });
    const outsideIds = (await (await getPending(send("GET", "/leave-requests/pending-approval"))).json()).requests.map((r: { id: string }) => r.id);
    assert.ok(!outsideIds.includes(ownSa.id), "dal pubblico (admin) la sua richiesta non c'è");
    assert.equal((await decide(ownSa.id, { status: "approved", version: leaveVersion(ownSa) })).status, 403);
    assert.equal(await statusOf(ownSa.id), "pending");

    setRequest({ bearer: saToken, headers: { "x-real-ip": "192.168.11.5" } });
    const ids = (await (await getPending(send("GET", "/leave-requests/pending-approval"))).json()).requests.map((r: { id: string }) => r.id);
    assert.ok(ids.includes(ownSa.id), "la sua richiesta è in elenco");
    assert.ok(ids.includes(ownAd.id) && ids.includes(ownR.id), "le altre ci sono comunque");
    resetCacheCalls();
    const res = await decide(ownSa.id, { status: "approved", version: leaveVersion(ownSa) });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).request.status, "approved");
    assert.equal(cacheCalls.after, 1, "mail programmata come per le altre");
    assert.equal(await statusOf(ownSa.id), "approved");
    // Versione vecchia → 409 anche per il super admin sulla propria.
    assert.equal((await decide(ownSa.id, { status: "rejected", version: leaveVersion(ownSa) })).status, 409);

    await login("ap-ad");
    const adIds = (await (await getPending(send("GET", "/leave-requests/pending-approval"))).json()).requests.map((r: { id: string }) => r.id);
    assert.ok(!adIds.includes(ownAd.id), "l'admin non vede la propria");
    assert.equal((await decide(ownAd.id, { status: "approved", version: leaveVersion(ownAd) })).status, 403);
    assert.equal(await statusOf(ownAd.id), "pending");

    await login("ap-r");
    assert.equal((await decide(ownR.id, { status: "approved", version: leaveVersion(ownR) })).status, 403);
    assert.equal(await statusOf(ownR.id), "pending");
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

  // Decisione ⚑ elemento #363: si salva chi ha deciso e quando (non mostrato).
  describe("chi e quando ha deciso", () => {
    const decidedOf = async (id: string) => {
      const r = await prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
      return { by: r.decidedById, at: r.decidedAt };
    };

    it("approvata o rifiutata (app e service): decidedById = chi decide, decidedAt valorizzato", async () => {
      await makeUser("ap-ad", "admin");
      await makeUser("ap-m");
      const a = await pending("ap-m", "ferie", "2026-12-01");
      const b = await pending("ap-m", "ferie", "2026-12-02");
      assert.deepEqual(await decidedOf(a.id), { by: null, at: null });
      await login("ap-ad");
      const before = Date.now();
      assert.equal((await decide(a.id, { status: "approved", version: leaveVersion(a) })).status, 200);
      const da = await decidedOf(a.id);
      assert.equal(da.by, "ap-ad");
      assert.ok(da.at && da.at.getTime() >= before - 1000 && da.at.getTime() <= Date.now() + 1000);
      const deps = { notifyLeaveDecision: async () => undefined };
      await decideLeaveRequest({ id: "ap-ad", role: "admin", employmentType: "dipendente" }, b.id, "rejected", undefined, { deps });
      assert.equal((await decidedOf(b.id)).by, "ap-ad");
      assert.ok((await decidedOf(b.id)).at);
    });

    it("409 (versione cambiata o già decisa): nessun campo scritto", async () => {
      await makeUser("ap-ad", "admin");
      await makeUser("ap-m");
      const req = await pending("ap-m");
      await login("ap-ad");
      assert.equal((await decide(req.id, { status: "approved", version: "versione-vecchia" })).status, 409);
      assert.deepEqual(await decidedOf(req.id), { by: null, at: null });
    });

    it("riportare in attesa azzera chi e quando", async () => {
      await makeUser("ap-ad", "admin");
      await makeUser("ap-m");
      const req = await pending("ap-m");
      await login("ap-ad");
      assert.equal((await decide(req.id, { status: "approved", version: leaveVersion(req) })).status, 200);
      assert.equal((await decidedOf(req.id)).by, "ap-ad");
      const { clearDecisionNote } = await import("../src/lib/services/leave");
      await prisma.leaveRequest.update({ where: { id: req.id }, data: { status: "pending", ...clearDecisionNote() } });
      assert.deepEqual(await decidedOf(req.id), { by: null, at: null });
    });

    it("decisore cancellato: decidedById torna null, la richiesta resta", async () => {
      await makeUser("ap-ad", "admin");
      await makeUser("ap-m");
      const req = await pending("ap-m");
      await login("ap-ad");
      assert.equal((await decide(req.id, { status: "approved", version: leaveVersion(req) })).status, 200);
      await prisma.session.deleteMany();
      await prisma.impersonationLog.deleteMany();
      await prisma.user.delete({ where: { id: "ap-ad" } });
      const r = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: req.id } });
      assert.equal(r.status, "approved");
      assert.equal(r.decidedById, null);
    });
  });

  // F6 T1b (decisione ⚑ elemento #353): nota del responsabile alla decisione.
  describe("nota alla decisione", () => {
    const noteOf = async (id: string) => (await prisma.leaveRequest.findUniqueOrThrow({ where: { id } })).decisionNote;

    it("app: la nota viene salvata (con trim), restituita da decision e dagli elenchi del richiedente", async () => {
      await makeUser("ap-ad", "admin");
      await makeUser("ap-m");
      const req = await pending("ap-m");
      await login("ap-ad");
      const res = await decide(req.id, { status: "rejected", version: leaveVersion(req), note: "  Periodo di chiusura, riprova a gennaio  " });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { request: { decisionNote: string | null; status: string } };
      assert.equal(body.request.status, "rejected");
      assert.equal(body.request.decisionNote, "Periodo di chiusura, riprova a gennaio");
      assert.equal(await noteOf(req.id), "Periodo di chiusura, riprova a gennaio");

      // Il richiedente la vede nell'elenco e nel dettaglio delle sue richieste.
      await login("ap-m");
      const { GET: listOwn } = await import("../src/app/api/mobile/v1/leave-requests/route");
      const { GET: getOne } = await import("../src/app/api/mobile/v1/leave-requests/[id]/route");
      const list = await listOwn(send("GET", "/leave-requests"));
      const items = ((await list.json()) as { requests: { id: string; decisionNote: string | null }[] }).requests;
      assert.equal(items.find((r) => r.id === req.id)?.decisionNote, "Periodo di chiusura, riprova a gennaio");
      const one = await getOne(send("GET", `/leave-requests/${req.id}`), idCtx(req.id));
      assert.equal(((await one.json()) as { request: { decisionNote: string | null } }).request.decisionNote, "Periodo di chiusura, riprova a gennaio");
    });

    it("nota vuota o di soli spazi → null; senza nota → null; la nota non cambia la versione", async () => {
      await makeUser("ap-ad", "admin");
      await makeUser("ap-m");
      const a = await pending("ap-m");
      const b = await pending("ap-m", "ferie", "2026-12-02");
      const versionBefore = leaveVersion(a);
      await login("ap-ad");
      assert.equal((await decide(a.id, { status: "approved", version: versionBefore, note: "   " })).status, 200);
      assert.equal(await noteOf(a.id), null);
      assert.equal((await decide(b.id, { status: "approved", version: leaveVersion(b) })).status, 200);
      assert.equal(await noteOf(b.id), null);
      const after = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: a.id } });
      assert.equal(leaveVersion(after), versionBefore);
    });

    it("500 caratteri passano, 501 → 400 e la richiesta resta in attesa; nota non testuale → 400", async () => {
      await makeUser("ap-ad", "admin");
      await makeUser("ap-m");
      const req = await pending("ap-m");
      await login("ap-ad");
      const tooLong = await decide(req.id, { status: "approved", version: leaveVersion(req), note: "x".repeat(501) });
      assert.equal(tooLong.status, 400);
      assert.equal(await statusOf(req.id), "pending");
      assert.equal(await noteOf(req.id), null);
      const notText = await decide(req.id, { status: "approved", version: leaveVersion(req), note: 42 });
      assert.equal(notText.status, 400);
      assert.equal(await statusOf(req.id), "pending");
      const ok = await decide(req.id, { status: "approved", version: leaveVersion(req), note: "x".repeat(500) });
      assert.equal(ok.status, 200);
      assert.equal((await noteOf(req.id))?.length, 500);
    });

    it("service (web): la nota facoltativa passa nelle opzioni; i 409 restano quelli di prima", async () => {
      await makeUser("ap-ad", "admin");
      await makeUser("ap-ad2", "admin");
      await makeUser("ap-m");
      const req = await pending("ap-m");
      const actor = (id: string) => ({ id, role: "admin", employmentType: "dipendente" });
      const deps = { notifyLeaveDecision: async () => undefined };
      const out = await decideLeaveRequest(actor("ap-ad"), req.id, "approved", leaveVersion(req), { deps, note: "Ok, buone ferie" });
      assert.equal(out.request.decisionNote, "Ok, buone ferie");
      await assert.rejects(
        decideLeaveRequest(actor("ap-ad2"), req.id, "rejected", undefined, { deps, note: "troppo tardi" }),
        ConflictError
      );
      assert.equal(await noteOf(req.id), "Ok, buone ferie");
    });

    it("riportare in attesa azzera la nota", async () => {
      await makeUser("ap-ad", "admin");
      await makeUser("ap-m");
      const req = await pending("ap-m");
      await login("ap-ad");
      assert.equal((await decide(req.id, { status: "rejected", version: leaveVersion(req), note: "no" })).status, 200);
      assert.equal(await noteOf(req.id), "no");
      const { clearDecisionNote } = await import("../src/lib/services/leave");
      await prisma.leaveRequest.update({ where: { id: req.id }, data: { status: "pending", ...clearDecisionNote() } });
      assert.equal(await noteOf(req.id), null);
    });

    it("mail di esito: mostra la nota (con escape HTML) solo se c'è", async () => {
      const { leaveDecisionEmail } = await import("../src/lib/email/templates");
      const base = { type: "ferie", status: "rejected", startDate: new Date("2026-12-01T00:00:00"), endDate: new Date("2026-12-01T00:00:00"), hours: null };
      const rec = { name: "Anna Rossi", email: "anna@approve.test" };
      const withNote = leaveDecisionEmail(rec as never, "https://time.test", { ...base, decisionNote: "Vedi <b>Marco</b> & riprova" });
      assert.ok(withNote);
      assert.ok(withNote.html.includes("Vedi &lt;b&gt;Marco&lt;/b&gt; &amp; riprova"));
      assert.ok(!withNote.html.includes("<b>Marco</b>"));
      const without = leaveDecisionEmail(rec as never, "https://time.test", { ...base, decisionNote: null });
      assert.ok(without);
      assert.ok(!without.html.includes("Marco"));
    });
  });
});
