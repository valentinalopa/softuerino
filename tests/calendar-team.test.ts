// listTeamCalendar (F2): chi c'è / chi è assente. DB di prova in /tmp (vedi calendar-service.test.ts).
import "./helpers/next-stubs";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { listTeamCalendar, parseCalendarRange } from "../src/lib/services/calendar";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const range = () => parseCalendarRange("2026-12-01", "2026-12-31");
const viewer = (id: string, role = "membro") => ({ id, role });

async function user(id: string, role = "membro", active = true) {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@example.test`, passwordHash: "x", role, active },
  });
}
async function clean() {
  await prisma.leaveRequest.deleteMany({ where: { user: { email: { endsWith: "@example.test" } } } });
  await prisma.presenceEntry.deleteMany({ where: { user: { email: { endsWith: "@example.test" } } } });
  await prisma.userDepartment.deleteMany({ where: { user: { email: { endsWith: "@example.test" } } } });
  await prisma.department.deleteMany({ where: { name: { startsWith: "T-" } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
}
async function leave(userId: string, type: string, note = "nota riservata", status = "approved") {
  return prisma.leaveRequest.create({
    data: { userId, type, status, note, startDate: day(2026, 12, 10), endDate: day(2026, 12, 11) },
  });
}

describe("listTeamCalendar", () => {
  beforeEach(async () => {
    await clean();
    await user("tc-a"); // chi guarda
    await user("tc-b"); // collega
    await user("tc-adm", "admin");
    await user("tc-off", "membro", false); // disattivato
  });

  it("il membro vede chi è assente ma con tipo generico, senza note né id richiesta", async () => {
    await leave("tc-b", "ferie");
    const r = await listTeamCalendar(viewer("tc-a"), range());
    assert.equal(r.absences.length, 1);
    const a = r.absences[0] as Record<string, unknown>;
    assert.equal(a.userId, "tc-b");
    assert.equal(a.userName, "Nome tc-b");
    assert.equal(a.type, "assenza");
    assert.equal(a.startDate, "2026-12-10");
    assert.ok(!("note" in a) && !("id" in a));
    assert.ok(!JSON.stringify(r).includes("nota riservata"));
  });

  it("la malattia non esce mai con il suo tipo a un membro; l'admin vede il motivo", async () => {
    await leave("tc-b", "malattia", "diagnosi");
    const asMember = await listTeamCalendar(viewer("tc-a"), range());
    assert.equal(asMember.absences[0].type, "assenza");
    assert.ok(!JSON.stringify(asMember).includes("malattia"));
    const asAdmin = await listTeamCalendar(viewer("tc-adm", "admin"), range());
    assert.equal(asAdmin.absences[0].type, "malattia");
    assert.ok(!JSON.stringify(asAdmin).includes("diagnosi"));
  });

  it("l'interessato vede il proprio motivo; il membro non vede ferie altrui", async () => {
    await leave("tc-a", "ferie");
    const own = await listTeamCalendar(viewer("tc-a"), range());
    assert.equal(own.absences[0].type, "ferie");
    const other = await listTeamCalendar(viewer("tc-b"), range());
    assert.equal(other.absences[0].type, "assenza");
  });

  it("le richieste rifiutate e gli utenti disattivati non compaiono; il periodo filtra", async () => {
    await leave("tc-b", "ferie", "x", "rejected");
    await leave("tc-off", "ferie");
    await prisma.leaveRequest.create({
      data: { userId: "tc-b", type: "ferie", status: "approved", startDate: day(2027, 3, 1), endDate: day(2027, 3, 2) },
    });
    const r = await listTeamCalendar(viewer("tc-a"), range());
    assert.equal(r.absences.length, 0);
  });

  it("presenze dei colleghi attivi con nome, giorno AAAA-MM-GG", async () => {
    await prisma.presenceEntry.create({ data: { userId: "tc-b", date: day(2026, 12, 3), slot: "giornata_intera", mode: "ufficio" } });
    await prisma.presenceEntry.create({ data: { userId: "tc-off", date: day(2026, 12, 3), slot: "giornata_intera", mode: "ufficio" } });
    const r = await listTeamCalendar(viewer("tc-a"), range());
    assert.deepEqual(r.presences, [
      { userId: "tc-b", userName: "Nome tc-b", date: "2026-12-03", slot: "giornata_intera", mode: "ufficio" },
    ]);
  });

  it("un responsabile del reparto vede il motivo (non la malattia) dei suoi", async () => {
    const dep = await prisma.department.create({ data: { name: "T-rep" } });
    await prisma.userDepartment.createMany({
      data: [
        { userId: "tc-a", departmentId: dep.id, isManager: true },
        { userId: "tc-b", departmentId: dep.id, isManager: false },
      ],
    });
    await leave("tc-b", "ferie");
    // Di default il responsabile non ha "approvare": lo abilitiamo nel reparto.
    await prisma.department.update({
      where: { id: dep.id },
      data: { permissions: JSON.stringify({ approvare: { responsabile: "reparto" } }) },
    });
    const r = await listTeamCalendar(viewer("tc-a"), range());
    assert.equal(r.absences[0].type, "ferie");
    // Un membro semplice dello stesso reparto no.
    const m = await listTeamCalendar(viewer("tc-b"), range());
    assert.equal(m.absences[0].type, "ferie"); // è la sua assenza
    await leave("tc-a", "permesso");
    const m2 = await listTeamCalendar(viewer("tc-b"), range());
    assert.ok(m2.absences.some((a) => a.userId === "tc-a" && a.type === "assenza"));
  });
});
