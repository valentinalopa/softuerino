// Richieste, saldi e recuperi dell'app: service (src/lib/services/leave.ts) e route /v1/leave-requests,
// /v1/balance, /v1/recovery-credits, /v1/me. Solo DB di prova in /tmp (vedi tests/helpers/db-guard.ts):
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx tsx --test tests/mobile-leave.test.ts
import { setRequest } from "./helpers/next-stubs";
import { cacheCalls, resetCacheCalls } from "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { issueSessionToken } from "../src/lib/auth/session";
import { getLeaveBalance, balanceFigures } from "../src/lib/leave-balance";
import { getRecoveryCreditsForUsers, toOpenRecoveryCredits } from "../src/lib/recovery-credits";
import { GET as getRequests, POST as postRequest } from "../src/app/api/mobile/v1/leave-requests/route";
import { GET as getRequest, PATCH as patchRequest, DELETE as deleteRequest } from "../src/app/api/mobile/v1/leave-requests/[id]/route";
import { POST as postPreview } from "../src/app/api/mobile/v1/leave-requests/preview/route";
import { availableAt, chargeAmount } from "../src/lib/leave-accrual";
import { GET as getBalance } from "../src/app/api/mobile/v1/balance/route";
import { GET as getCredits } from "../src/app/api/mobile/v1/recovery-credits/route";
import { GET as getMe } from "../src/app/api/mobile/v1/me/route";
import { createLeaveRequest } from "../src/lib/services/leave";
import { ConflictError, ValidationError } from "../src/lib/services/errors";
import { leaveTypesFor } from "../src/lib/constants";

const URL_BASE = "https://time.test/api/mobile/v1";
const send = (method: string, path: string, body?: unknown) =>
  new Request(`${URL_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeUser(id: string, extra: { role?: string; employmentType?: string } = {}) {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@leave.test`, passwordHash: "x", role: extra.role ?? "membro", active: true, employmentType: extra.employmentType ?? "dipendente" },
  });
}
async function login(userId: string) {
  const { token } = await issueSessionToken(userId, { authMethod: "oidc", client: "ios" });
  setRequest({ bearer: token });
}
const countRequests = (userId: string) => prisma.leaveRequest.count({ where: { userId } });

describe("richieste dell'app", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany({ where: { email: { endsWith: "@leave.test" } } });
    setRequest();
    resetCacheCalls();
  });

  it("modifica e ritiro di una richiesta in attesa: 200/204 con avviso; già decisa → 409; di altri → 404", async () => {
    await makeUser("w1");
    await makeUser("w2");
    await login("w1");
    let res = await postRequest(send("POST", "/leave-requests", { type: "ferie", startDate: "2026-12-01", endDate: "2026-12-02" }));
    const { request } = await res.json();
    resetCacheCalls();
    res = await patchRequest(send("PATCH", `/leave-requests/${request.id}`, { type: "ferie", startDate: "2026-12-01", endDate: "2026-12-04" }), idCtx(request.id));
    assert.equal(res.status, 200);
    const patched = (await res.json()).request;
    assert.equal(patched.endDate, "2026-12-04");
    assert.equal(patched.status, "pending");
    assert.equal(cacheCalls.after, 1);
    // Malattia non ammessa in modifica (come sul web).
    assert.equal((await patchRequest(send("PATCH", `/leave-requests/${request.id}`, { type: "malattia", startDate: "2026-12-01" }), idCtx(request.id))).status, 400);

    resetCacheCalls();
    res = await deleteRequest(send("DELETE", `/leave-requests/${request.id}`), idCtx(request.id));
    assert.equal(res.status, 204);
    assert.equal(cacheCalls.after, 1);
    assert.equal(await countRequests("w1"), 0);

    const decided = await prisma.leaveRequest.create({ data: { userId: "w1", type: "ferie", startDate: new Date("2026-12-10T00:00:00"), endDate: new Date("2026-12-10T00:00:00"), status: "approved" } });
    assert.equal((await deleteRequest(send("DELETE", `/leave-requests/${decided.id}`), idCtx(decided.id))).status, 409);
    assert.equal((await patchRequest(send("PATCH", `/leave-requests/${decided.id}`, { type: "ferie", startDate: "2026-12-11" }), idCtx(decided.id))).status, 409);

    const other = await prisma.leaveRequest.create({ data: { userId: "w2", type: "ferie", startDate: new Date("2026-12-10T00:00:00"), endDate: new Date("2026-12-10T00:00:00"), status: "pending" } });
    assert.equal((await deleteRequest(send("DELETE", `/leave-requests/${other.id}`), idCtx(other.id))).status, 404);
    assert.equal(await countRequests("w2"), 1);
  });

  it("anteprima del saldo: stesso calcolo del form web; fuori monte o senza saldi → after null; non scrive nulla", async () => {
    await makeUser("p1", { employmentType: "partita_iva" });
    await login("p1");
    let res = await postPreview(send("POST", "/leave-requests/preview", { type: "assenza", startDate: "2026-12-01", endDate: "2026-12-03" }));
    assert.equal(res.status, 200);
    const { preview } = await res.json();
    const info = (await getLeaveBalance("p1", "partita_iva")).charges.assenza!;
    const requested = chargeAmount(info, { days: 3, hours: null });
    assert.equal(preview.charged, "assenza");
    assert.equal(preview.requested, requested);
    assert.equal(preview.after, Math.round((availableAt(info, new Date("2026-12-03T00:00:00")) - requested) * 100) / 100);
    assert.equal(await countRequests("p1"), 0);
    res = await postPreview(send("POST", "/leave-requests/preview", { type: "assenza_extra", startDate: "2026-12-01" }));
    assert.equal((await res.json()).preview.after, null);
    assert.equal((await postPreview(send("POST", "/leave-requests/preview", { type: "ferie", startDate: "2026-12-01" }))).status, 400);
    assert.equal((await postPreview(send("POST", "/leave-requests/preview", { type: "assenza", startDate: "2026-13-01" }))).status, 400);

    await makeUser("p2");
    await login("p2");
    res = await postPreview(send("POST", "/leave-requests/preview", { type: "ferie", startDate: "2026-12-01" }));
    assert.equal((await res.json()).preview.after, null);
  });

  it("punto 2: anteprima in modifica come il form web — la richiesta in attesa non è nel saldo, 8h modificata a 6h scala 6h", async () => {
    await makeUser("p3");
    await prisma.user.update({ where: { id: "p3" }, data: { dailyHours: 8 } });
    await prisma.leaveBalanceStart.create({
      data: { userId: "p3", month: new Date(2026, 8, 1), ferieHours: 22.42, rolHours: 40, ferieHoursPerYear: 86.67, rolHoursPerYear: 14.12 },
    });
    await login("p3");
    const slot = (endTime: string) => ({ type: "permesso", startDate: "2026-12-01", startTime: "09:00", endTime });
    const previewOf = async (endTime: string) => (await (await postPreview(send("POST", "/leave-requests/preview", slot(endTime)))).json()).preview;
    const before6 = await previewOf("15:00");
    assert.equal(before6.requested, 6);
    // Richiesta in attesa di 8h (09–17), poi modificata a 6h (09–15).
    let res = await postRequest(send("POST", "/leave-requests", slot("17:00")));
    assert.equal(res.status, 201);
    const { request } = await res.json();
    // Con la richiesta in attesa l'anteprima di 6h è identica a quella senza: le richieste
    // in attesa non entrano nel saldo (come nel form web), quindi non si conta due volte.
    const with6 = await previewOf("15:00");
    assert.equal(with6.requested, 6);
    assert.deepEqual(with6, before6);
    assert.equal(with6.after, Math.round((with6.available - 6) * 100) / 100);
    res = await patchRequest(send("PATCH", `/leave-requests/${request.id}`, slot("15:00")), idCtx(request.id));
    assert.equal(res.status, 200);
    assert.deepEqual(await previewOf("15:00"), before6);
  });

  it("punto 3: modifiche in contemporanea — passa solo la prima, l'altra riceve 409 «La richiesta è cambiata, ricarica»", async () => {
    await makeUser("c1");
    await login("c1");
    const body = (endDate: string, version?: string) => ({ type: "ferie", startDate: "2026-12-01", endDate, ...(version ? { version } : {}) });
    let res = await postRequest(send("POST", "/leave-requests", body("2026-12-02")));
    const created = (await res.json()).request;
    assert.equal(typeof created.version, "string");
    // Due dispositivi hanno la stessa versione: la prima modifica passa, la seconda no.
    res = await patchRequest(send("PATCH", `/leave-requests/${created.id}`, body("2026-12-03", created.version)), idCtx(created.id));
    assert.equal(res.status, 200);
    const edited = (await res.json()).request;
    assert.notEqual(edited.version, created.version);
    res = await patchRequest(send("PATCH", `/leave-requests/${created.id}`, body("2026-12-04", created.version)), idCtx(created.id));
    assert.equal(res.status, 409);
    assert.equal((await res.json()).message, "La richiesta è cambiata, ricarica");
    assert.equal((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: created.id } })).endDate.getDate(), 3);
    // Ritiro con una versione vecchia: 409 e la richiesta resta.
    res = await deleteRequest(send("DELETE", `/leave-requests/${created.id}?version=${encodeURIComponent(created.version)}`), idCtx(created.id));
    assert.equal(res.status, 409);
    assert.equal(await countRequests("c1"), 1);
    // Senza versione (client che non la manda) e con quella giusta: come prima.
    res = await patchRequest(send("PATCH", `/leave-requests/${created.id}`, body("2026-12-04")), idCtx(created.id));
    assert.equal(res.status, 200);
    const now = (await res.json()).request;
    res = await deleteRequest(send("DELETE", `/leave-requests/${created.id}?version=${encodeURIComponent(now.version)}`), idCtx(created.id));
    assert.equal(res.status, 204);
    assert.equal(await countRequests("c1"), 0);
  });

  it("punto 3: due PATCH davvero simultanee con la stessa versione → una sola passa", async () => {
    await makeUser("c2");
    await login("c2");
    const send2 = (endDate: string, version: string, id: string) =>
      patchRequest(send("PATCH", `/leave-requests/${id}`, { type: "ferie", startDate: "2026-12-01", endDate, version }), idCtx(id));
    const created = (await (await postRequest(send("POST", "/leave-requests", { type: "ferie", startDate: "2026-12-01", endDate: "2026-12-02" }))).json()).request;
    const results = await Promise.all([send2("2026-12-03", created.version, created.id), send2("2026-12-04", created.version, created.id)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  });

  it("punto 3: la decisione del responsabile non passa se la richiesta è stata modificata dopo che l'ha vista", async () => {
    await makeUser("c3");
    await login("c3");
    const created = (await (await postRequest(send("POST", "/leave-requests", { type: "ferie", startDate: "2026-12-01", endDate: "2026-12-02" }))).json()).request;
    const seen = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: created.id } });
    await patchRequest(send("PATCH", `/leave-requests/${created.id}`, { type: "ferie", startDate: "2026-12-01", endDate: "2026-12-10" }), idCtx(created.id));
    // Stessa condizione di updateLeaveStatus (versionWhere sui campi letti prima della modifica).
    const { versionWhere } = await import("../src/lib/services/leave");
    const approved = await prisma.leaveRequest.updateMany({ where: { id: created.id, ...versionWhere(seen) }, data: { status: "approved" } });
    assert.equal(approved.count, 0);
    assert.equal((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: created.id } })).status, "pending");
  });

  it("senza Bearer tutte le route rispondono 401 JSON", async () => {
    const responses = [
      await getRequests(send("GET", "/leave-requests")),
      await postRequest(send("POST", "/leave-requests", {})),
      await getRequest(send("GET", "/leave-requests/x"), idCtx("x")),
      await getBalance(send("GET", "/balance")),
      await getCredits(send("GET", "/recovery-credits")),
    ];
    for (const res of responses) {
      assert.equal(res.status, 401);
      assert.equal((await res.json()).error, "unauthorized");
    }
    assert.equal(cacheCalls.after, 0);
  });

  it("ferie valide: 201, pending, notify programmata una sola volta", async () => {
    await makeUser("a1");
    await login("a1");
    const res = await postRequest(send("POST", "/leave-requests", { type: "ferie", startDate: "2027-03-01", endDate: "2027-03-03", note: "mare" }));
    assert.equal(res.status, 201);
    const { request } = await res.json();
    assert.equal(request.status, "pending");
    assert.equal(request.startDate, "2027-03-01");
    assert.equal(request.endDate, "2027-03-03");
    assert.equal(cacheCalls.after, 1);
    assert.ok(cacheCalls.revalidated.includes("/richieste"));
  });

  it("il service: notify chiama l'avviso una sola volta e solo se richiesto", async () => {
    await makeUser("a2");
    const calls: string[] = [];
    const deps = {
      notifyNewLeaveRequest: async (requestId: string, userId: string) => void calls.push(`${requestId}:${userId}`),
      notifyLeaveWithdrawn: async () => void calls.push("ritiro"),
    };
    const actor = { id: "a2", role: "membro", employmentType: "dipendente" };
    const { request, notify } = await createLeaveRequest(actor, { type: "ferie", startDate: "2027-04-05" }, deps);
    assert.equal(calls.length, 0, "la creazione non manda nulla da sola");
    await notify();
    assert.deepEqual(calls, [`${request.id}:a2`]);
  });

  it("punto 1: ferie sovrapposte ad assenza approvata o in attesa → 409, nessuna riga nuova, nessuna notify", async () => {
    await makeUser("a3");
    await login("a3");
    const owner = { userId: "a3", type: "ferie", hours: null, note: null };
    await prisma.leaveRequest.create({ data: { ...owner, startDate: new Date("2027-05-10T00:00:00"), endDate: new Date("2027-05-12T00:00:00"), status: "approved" } });
    await prisma.leaveRequest.create({ data: { ...owner, startDate: new Date("2027-06-10T00:00:00"), endDate: new Date("2027-06-12T00:00:00"), status: "pending" } });
    for (const [start, end] of [["2027-05-12", "2027-05-14"], ["2027-06-09", "2027-06-10"]]) {
      resetCacheCalls();
      const res = await postRequest(send("POST", "/leave-requests", { type: "ferie", startDate: start, endDate: end }));
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.error, "conflict");
      assert.match(body.message, /già una richiesta/);
      assert.equal(cacheCalls.after, 0, "nessuna mail in caso di errore");
    }
    assert.equal(await countRequests("a3"), 2);
  });

  it("una richiesta respinta non blocca le stesse date", async () => {
    await makeUser("a4");
    await login("a4");
    await prisma.leaveRequest.create({ data: { userId: "a4", type: "ferie", startDate: new Date("2027-07-01T00:00:00"), endDate: new Date("2027-07-02T00:00:00"), status: "rejected" } });
    const res = await postRequest(send("POST", "/leave-requests", { type: "ferie", startDate: "2027-07-01", endDate: "2027-07-02" }));
    assert.equal(res.status, 201);
  });

  it("punto 2: permesso a ore con orari invertiti, uguali o non validi → 400, nessuna notify", async () => {
    await makeUser("a5");
    await login("a5");
    const cases: [string, string][] = [["11:00", "09:00"], ["09:00", "09:00"], ["09:00", "25:00"], ["9", "11"], ["", "11:00"]];
    for (const [startTime, endTime] of cases) {
      resetCacheCalls();
      const res = await postRequest(send("POST", "/leave-requests", { type: "permesso", startDate: "2027-08-02", startTime, endTime }));
      assert.equal(res.status, 400, `${startTime}-${endTime}`);
      assert.equal((await res.json()).error, "invalid_request");
      assert.equal(cacheCalls.after, 0);
    }
    assert.equal(await countRequests("a5"), 0);
    const ok = await postRequest(send("POST", "/leave-requests", { type: "permesso", startDate: "2027-08-02", startTime: "09:00", endTime: "11:30" }));
    assert.equal(ok.status, 201);
    const { request } = await ok.json();
    assert.equal(request.hours, 2.5);
    assert.equal(request.endDate, "2027-08-02");
    // A ore la data di fine è ignorata, anche se non valida (come sul web).
    const ignoredEnd = await postRequest(send("POST", "/leave-requests", { type: "permesso", startDate: "2027-08-03", endDate: "boh", startTime: "09:00", endTime: "10:00" }));
    assert.equal(ignoredEnd.status, 201);
  });

  it("punto 5: recupero senza credito e senza nota → 400; con nota o con credito → 201", async () => {
    await makeUser("a6");
    await login("a6");
    let res = await postRequest(send("POST", "/leave-requests", { type: "recupero", startDate: "2027-09-01" }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /nota è obbligatoria/);
    assert.equal(cacheCalls.after, 0);
    res = await postRequest(send("POST", "/leave-requests", { type: "recupero", startDate: "2027-09-01", note: "trasferta Milano" }));
    assert.equal(res.status, 201);
    const credit = await prisma.recoveryCredit.create({ data: { userId: "a6", reason: "Trasferta", amount: 1, unit: "giorni", earnedOn: new Date("2027-01-10T00:00:00") } });
    res = await postRequest(send("POST", "/leave-requests", { type: "recupero", startDate: "2027-09-10", recoveryCreditId: credit.id }));
    assert.equal(res.status, 201);
    assert.equal((await res.json()).request.recoveryCredit.id, credit.id);
  });

  it("recupero collegato al credito di un altro membro → 404", async () => {
    await makeUser("a7");
    await makeUser("a7b");
    const credit = await prisma.recoveryCredit.create({ data: { userId: "a7b", reason: "X", amount: 1, unit: "giorni", earnedOn: new Date("2027-01-10T00:00:00") } });
    await login("a7");
    const res = await postRequest(send("POST", "/leave-requests", { type: "recupero", startDate: "2027-09-20", recoveryCreditId: credit.id }));
    assert.equal(res.status, 404);
  });

  it("tipo non ammesso per il rapporto di lavoro → 400 (partita IVA senza ferie, dipendente senza assenza)", async () => {
    await makeUser("iva", { employmentType: "partita_iva" });
    await makeUser("dip");
    await login("iva");
    let res = await postRequest(send("POST", "/leave-requests", { type: "ferie", startDate: "2027-10-01" }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /Tipo di richiesta non valido/);
    res = await postRequest(send("POST", "/leave-requests", { type: "assenza", startDate: "2027-10-01" }));
    assert.equal(res.status, 201);
    await login("dip");
    res = await postRequest(send("POST", "/leave-requests", { type: "assenza", startDate: "2027-10-01" }));
    assert.equal(res.status, 400);
    assert.equal(cacheCalls.after, 1, "solo la richiesta riuscita ha programmato la mail");
  });

  it("date non valide o fine prima dell'inizio → 400", async () => {
    await makeUser("a8");
    await login("a8");
    for (const body of [
      { type: "ferie" },
      { type: "ferie", startDate: "01/03/2027" },
      { type: "ferie", startDate: "2027-13-01" },
      { type: "ferie", startDate: "2027-03-01", endDate: "abc" },
      { type: "ferie", startDate: "2027-03-05", endDate: "2027-03-01" },
    ]) {
      assert.equal((await postRequest(send("POST", "/leave-requests", body))).status, 400, JSON.stringify(body));
    }
    const nonJson = await postRequest(new Request(`${URL_BASE}/leave-requests`, { method: "POST", body: "no" }));
    assert.equal(nonJson.status, 400);
  });

  it("punto 1 (come il web): nessun controllo calendario sul giorno, solo date leggibili; la fine è ignorata per i permessi a ore", async () => {
    await makeUser("a9");
    await login("a9");
    // Il web (parseLeaveForm, PR #50) non controlla che il giorno esista: new Date lo normalizza.
    const odd = await postRequest(send("POST", "/leave-requests", { type: "ferie", startDate: "2027-02-30" }));
    assert.equal(odd.status, 201);
    assert.equal((await odd.json()).request.startDate, "2027-03-02");
    // A ore la data di fine è ignorata, anche se non è una data.
    const hourly = await postRequest(send("POST", "/leave-requests", { type: "permesso", startDate: "2027-04-06", endDate: "abc", startTime: "09:00", endTime: "11:00" }));
    assert.equal(hourly.status, 201);
  });

  it("userId nel corpo viene ignorato: la richiesta è sempre per sé, anche per un admin", async () => {
    await makeUser("adm", { role: "admin" });
    await makeUser("victim");
    await login("adm");
    const res = await postRequest(send("POST", "/leave-requests", { type: "ferie", startDate: "2027-11-02", userId: "victim" }));
    assert.equal(res.status, 201);
    assert.equal((await res.json()).request.status, "pending");
    assert.equal(await countRequests("victim"), 0);
    assert.equal(await countRequests("adm"), 1);
  });

  it("service: un membro non può creare per conto di altri (403), un admin sì, già approvata e senza mail", async () => {
    await makeUser("m1");
    await makeUser("m2");
    await makeUser("adm2", { role: "admin" });
    const calls: string[] = [];
    const deps = { notifyNewLeaveRequest: async () => void calls.push("mail"), notifyLeaveWithdrawn: async () => void calls.push("ritiro") };
    await assert.rejects(
      createLeaveRequest({ id: "m1", role: "membro", employmentType: "dipendente" }, { type: "ferie", startDate: "2027-12-01", userId: "m2" }, deps),
      { status: 403 }
    );
    const { request, notify } = await createLeaveRequest({ id: "adm2", role: "admin", employmentType: "dipendente" }, { type: "ferie", startDate: "2027-12-01", userId: "m2" }, deps);
    assert.equal(request.status, "approved");
    await notify();
    assert.equal(calls.length, 0);
    assert.equal(await countRequests("m2"), 1);
  });

  it("service: impersonificazione → 403 e nessuna riga", async () => {
    await makeUser("imp");
    await assert.rejects(
      createLeaveRequest({ id: "imp", role: "membro", employmentType: "dipendente", impersonating: true }, { type: "ferie", startDate: "2027-12-10" }),
      { status: 403 }
    );
    assert.equal(await countRequests("imp"), 0);
  });

  it("service: errori di validazione e conflitto sono ValidationError / ConflictError", async () => {
    await makeUser("a9");
    const actor = { id: "a9", role: "membro", employmentType: "dipendente" };
    await assert.rejects(createLeaveRequest(actor, { type: "boh", startDate: "2027-01-05" }), ValidationError);
    await createLeaveRequest(actor, { type: "ferie", startDate: "2027-01-05" });
    await assert.rejects(createLeaveRequest(actor, { type: "ferie", startDate: "2027-01-05" }), ConflictError);
  });

  it("elenco: solo le proprie, filtro ?year; dettaglio: le altrui → 404", async () => {
    await makeUser("b1");
    await makeUser("b2");
    const mk = (userId: string, d: string) => prisma.leaveRequest.create({ data: { userId, type: "ferie", startDate: new Date(`${d}T00:00:00`), endDate: new Date(`${d}T00:00:00`), status: "approved" } });
    const mine26 = await mk("b1", "2026-05-04");
    await mk("b1", "2027-05-04");
    const theirs = await mk("b2", "2026-05-04");
    await login("b1");
    let body = await (await getRequests(send("GET", "/leave-requests"))).json();
    assert.equal(body.requests.length, 2);
    body = await (await getRequests(send("GET", "/leave-requests?year=2026"))).json();
    assert.deepEqual(body.requests.map((r: { id: string }) => r.id), [mine26.id]);
    assert.equal((await getRequests(send("GET", "/leave-requests?year=abc"))).status, 400);
    assert.equal((await getRequest(send("GET", `/leave-requests/${mine26.id}`), idCtx(mine26.id))).status, 200);
    const other = await getRequest(send("GET", `/leave-requests/${theirs.id}`), idCtx(theirs.id));
    assert.equal(other.status, 404);
    assert.equal((await other.json()).error, "not_found");
    assert.equal((await getRequest(send("GET", "/leave-requests/inesistente"), idCtx("inesistente"))).status, 404);
  });

  it("balance coerente con la pagina Richieste (stesse funzioni), per dipendente e partita IVA", async () => {
    for (const employmentType of ["dipendente", "partita_iva"]) {
      const id = `bal-${employmentType}`;
      await makeUser(id, { employmentType });
      await prisma.leaveRequest.create({ data: { userId: id, type: employmentType === "dipendente" ? "ferie" : "assenza", startDate: new Date("2026-02-02T00:00:00"), endDate: new Date("2026-02-04T00:00:00"), status: "approved" } });
      await login(id);
      const res = await getBalance(send("GET", "/balance"));
      assert.equal(res.status, 200);
      const body = await res.json();
      const balance = await getLeaveBalance(id, employmentType as "dipendente" | "partita_iva");
      assert.deepEqual(body.figures, JSON.parse(JSON.stringify(balanceFigures(balance))));
      assert.equal(body.kind, balance.kind);
      if (balance.kind === "assenze") {
        assert.deepEqual(body.assenze, { allowance: balance.assenzeAllowance, used: balance.assenzeUsed, remaining: balance.assenzeRemaining });
        assert.equal(body.ferie, undefined);
      } else {
        assert.equal(body.dailyHours, balance.dailyHours);
        assert.deepEqual(body.ferie, JSON.parse(JSON.stringify(balance.ferie)));
        assert.deepEqual(body.permesso, JSON.parse(JSON.stringify(balance.permesso)));
        assert.equal(body.assenze, undefined);
      }
      assert.equal(body.year, new Date().getFullYear());
    }
  });

  it("recovery-credits: gli stessi della scelta nel form web, solo i propri", async () => {
    await makeUser("c1");
    await makeUser("c2");
    const mine = await prisma.recoveryCredit.create({ data: { userId: "c1", reason: "Trasferta Milano", amount: 2, unit: "giorni", earnedOn: new Date("2026-01-10T00:00:00") } });
    await prisma.recoveryCredit.create({ data: { userId: "c2", reason: "Altro", amount: 1, unit: "ore", earnedOn: new Date("2026-01-10T00:00:00") } });
    await login("c1");
    const body = await (await getCredits(send("GET", "/recovery-credits"))).json();
    const expected = toOpenRecoveryCredits((await getRecoveryCreditsForUsers(["c1"])).get("c1") ?? []);
    assert.deepEqual(body.recoveryCredits, expected);
    assert.deepEqual(body.recoveryCredits.map((c: { id: string }) => c.id), [mine.id]);
  });

  it("/me espone employmentType e leaveTypes", async () => {
    await makeUser("me1", { employmentType: "partita_iva" });
    await login("me1");
    const body = await (await getMe(send("GET", "/me"))).json();
    assert.equal(body.employmentType, "partita_iva");
    assert.deepEqual(body.leaveTypes, [...leaveTypesFor("partita_iva")]);
  });
});
