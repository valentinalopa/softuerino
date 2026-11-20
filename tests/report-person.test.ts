// Report per singola persona (F6, piano-report-persona S1-S4): getReport con e
// senza userId, e GET /v1/report?userId=… (403 non admin, 404 utente inesistente).
// Solo DB di prova in /tmp (tests/helpers/db-guard.ts).
import { setRequest } from "./helpers/next-stubs";
import "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { issueSessionToken } from "../src/lib/auth/session";
import { getReport } from "../src/lib/services/report";
import { ForbiddenError } from "../src/lib/task-archive";
import { NotFoundError } from "../src/lib/services/errors";
import { GET as getReportRoute } from "../src/app/api/mobile/v1/report/route";

const URL_BASE = "https://time.test/api/mobile/v1";
const get = (path: string) => new Request(`${URL_BASE}${path}`);

async function makeUser(id: string, role = "membro") {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@rp2.test`, passwordHash: "x", role, active: true, employmentType: "dipendente" },
  });
}
async function login(userId: string) {
  const { token } = await issueSessionToken(userId, { authMethod: "oidc", client: "ios" });
  setRequest({ bearer: token });
}

// Primo lunedì dal 8 giugno dell'anno corrente: nessuna festività fino al martedì successivo.
function juneMonday(now: Date): Date {
  const d = new Date(now.getFullYear(), 5, 8);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}
const totalHours = (report: Awaited<ReturnType<typeof getReport>>) =>
  report.clientTotals.reduce((sum, c) => sum + c.hours, 0);

describe("report per persona", () => {
  const now = new Date();
  let aId = "";
  let bId = "";

  async function cleanup() {
    await prisma.session.deleteMany();
    await prisma.impersonationLog.deleteMany();
    await prisma.timeEntry.deleteMany({ where: { user: { email: { endsWith: "@rp2.test" } } } });
    await prisma.leaveRequest.deleteMany({ where: { user: { email: { endsWith: "@rp2.test" } } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@rp2.test" } } });
    await prisma.client.deleteMany({ where: { name: { startsWith: "RP2-" } } });
    setRequest();
  }
  // Niente dati residui per gli altri test (DB di prova condiviso).
  after(cleanup);

  beforeEach(async () => {
    await cleanup();

    await makeUser("rp2-ad", "admin");
    await makeUser("rp2-m");
    aId = (await makeUser("rp2-a")).id;
    bId = (await makeUser("rp2-b")).id;
    const c1 = await prisma.client.create({ data: { name: "RP2-Cliente-1" } });
    const c2 = await prisma.client.create({ data: { name: "RP2-Cliente-2" } });
    const day = new Date(now.getFullYear(), now.getMonth(), 1);
    // a: 3 + 2 = 5 ore; b: 4 ore.
    await prisma.timeEntry.createMany({
      data: [
        { userId: aId, clientId: c1.id, date: day, hours: 3, description: "" },
        { userId: aId, clientId: c2.id, date: day, hours: 2, description: "" },
        { userId: bId, clientId: c1.id, date: day, hours: 4, description: "" },
      ],
    });
    const monday = juneMonday(now);
    const tuesday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 1);
    // a: 1 giorno di ferie approvato; b: 2 giorni.
    await prisma.leaveRequest.createMany({
      data: [
        { userId: aId, type: "ferie", startDate: monday, endDate: monday, status: "approved" },
        { userId: bId, type: "ferie", startDate: monday, endDate: tuesday, status: "approved" },
      ],
    });
  });

  it("getReport con userId: ore e assenze solo della persona", async () => {
    const forA = await getReport({ role: "admin" }, now, aId);
    assert.equal(totalHours(forA), 5);
    assert.equal(forA.leaveTotals.ferieDays, 1);
    const forB = await getReport({ role: "admin" }, now, bId);
    assert.equal(totalHours(forB), 4);
    assert.equal(forB.leaveTotals.ferieDays, 2);
    assert.equal(forA.months, 12);
    assert.equal(forA.hoursByMonth.rows.length, 12);
  });

  it("getReport senza userId: come prima, ore e assenze di tutto il team", async () => {
    const all = await getReport({ role: "admin" }, now);
    assert.ok(totalHours(all) >= 9, `ore team ${totalHours(all)}`);
    assert.ok(all.leaveTotals.ferieDays >= 3, `ferie team ${all.leaveTotals.ferieDays}`);
  });

  it("getReport: non admin → ForbiddenError, utente inesistente → NotFoundError", async () => {
    await assert.rejects(() => getReport({ role: "membro" }, now, aId), ForbiddenError);
    await assert.rejects(() => getReport({ role: "admin" }, now, "rp2-non-esiste"), NotFoundError);
  });

  it("route /report?userId=…: 403 per chi non è admin, 404 per utente inesistente, 200 filtrato per admin", async () => {
    await login("rp2-m");
    assert.equal((await getReportRoute(get(`/report?userId=${aId}`))).status, 403);

    await login("rp2-ad");
    assert.equal((await getReportRoute(get("/report?userId=rp2-non-esiste"))).status, 404);

    const res = await getReportRoute(get(`/report?userId=${aId}`));
    assert.equal(res.status, 200);
    const { report } = (await res.json()) as { report: Awaited<ReturnType<typeof getReport>> };
    assert.equal(totalHours(report), 5);
    assert.equal(report.leaveTotals.ferieDays, 1);

    // userId vuoto = report di tutto il team.
    const team = await getReportRoute(get("/report?userId="));
    assert.equal(team.status, 200);
    const { report: teamReport } = (await team.json()) as { report: Awaited<ReturnType<typeof getReport>> };
    assert.ok(totalHours(teamReport) >= 9);
  });
});
