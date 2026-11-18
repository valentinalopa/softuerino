// Report e Persone dall'app (F6 T2): /v1/report, /v1/people, /v1/people/{id}.
// Solo DB di prova in /tmp (tests/helpers/db-guard.ts).
import { setRequest } from "./helpers/next-stubs";
import "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { issueSessionToken } from "../src/lib/auth/session";
import { GET as getReport } from "../src/app/api/mobile/v1/report/route";
import { GET as getPeople } from "../src/app/api/mobile/v1/people/route";
import { GET as getPerson } from "../src/app/api/mobile/v1/people/[id]/route";

const URL_BASE = "https://time.test/api/mobile/v1";
const get = (path: string) => new Request(`${URL_BASE}${path}`);
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeUser(id: string, role = "membro", active = true) {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@rp.test`, passwordHash: "x", role, active, employmentType: "dipendente" },
  });
}
async function login(userId: string) {
  const { token } = await issueSessionToken(userId, { authMethod: "oidc", client: "ios" });
  setRequest({ bearer: token });
}
async function department(name: string, members: { userId: string; isManager?: boolean }[]) {
  const dep = await prisma.department.create({
    data: { name, permissions: JSON.stringify({ approvare: { responsabile: "reparto" } }) },
  });
  await prisma.userDepartment.createMany({
    data: members.map((m) => ({ userId: m.userId, departmentId: dep.id, isManager: m.isManager ?? false })),
  });
  return dep;
}
const peopleIds = async () =>
  ((await (await getPeople(get("/people"))).json()) as { people: { id: string }[] }).people.map((p) => p.id).filter((id) => id.startsWith("rp-"));

describe("report e persone dall'app", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.impersonationLog.deleteMany();
    await prisma.userDepartment.deleteMany({ where: { user: { email: { endsWith: "@rp.test" } } } });
    await prisma.department.deleteMany({ where: { name: { startsWith: "RP-" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@rp.test" } } });
    setRequest();
  });

  it("report: non admin → 403 (anche il responsabile), admin → 200 con soli numeri ed etichette", async () => {
    await makeUser("rp-ad", "admin");
    await makeUser("rp-r");
    await makeUser("rp-m");
    await department("RP-uno", [{ userId: "rp-r", isManager: true }, { userId: "rp-m" }]);
    for (const who of ["rp-m", "rp-r"]) {
      await login(who);
      assert.equal((await getReport(get("/report"))).status, 403);
    }
    await login("rp-ad");
    const res = await getReport(get("/report"));
    assert.equal(res.status, 200);
    const { report } = (await res.json()) as { report: Record<string, unknown> };
    assert.equal(report.months, 12);
    assert.equal(typeof report.year, "number");
    assert.equal((report.hoursByMonth as { rows: unknown[] }).rows.length, 12);
    for (const key of ["clientTotals", "clientBreakdown", "leaveTotals"]) assert.ok(key in report, key);
    assert.equal(typeof (report.leaveTotals as { ferieDays: number }).ferieDays, "number");
  });

  it("persone: l'admin vede tutti (anche disattivati) con i saldi", async () => {
    await makeUser("rp-ad", "admin");
    await makeUser("rp-a");
    await makeUser("rp-off", "membro", false);
    await login("rp-ad");
    const ids = await peopleIds();
    for (const id of ["rp-ad", "rp-a", "rp-off"]) assert.ok(ids.includes(id), id);
    const { people } = (await (await getPeople(get("/people"))).json()) as { people: { id: string; balances: unknown }[] };
    assert.notEqual(people.find((p) => p.id === "rp-a")?.balances, undefined);
    assert.ok(people.find((p) => p.id === "rp-a")?.balances);
  });

  it("persone: il responsabile vede le persone attive dei suoi reparti, senza sé stesso né saldi; il membro senza permessi niente", async () => {
    await makeUser("rp-r");
    await makeUser("rp-a");
    await makeUser("rp-off", "membro", false);
    await makeUser("rp-x");
    await department("RP-uno", [{ userId: "rp-r", isManager: true }, { userId: "rp-a" }, { userId: "rp-off" }]);
    await department("RP-due", [{ userId: "rp-x" }]);
    await login("rp-r");
    assert.deepEqual(await peopleIds(), ["rp-a"]);
    const { people } = (await (await getPeople(get("/people"))).json()) as { people: { id: string; balances: unknown; departments: string[] }[] };
    const a = people.find((p) => p.id === "rp-a")!;
    assert.equal(a.balances, null);
    assert.deepEqual(a.departments, ["RP-uno"]);
    await login("rp-x");
    assert.deepEqual(await peopleIds(), []);
  });

  it("dettaglio: visibile → 200; fuori ambito, disattivato o sé stesso (responsabile) → 404; admin sempre 200", async () => {
    await makeUser("rp-ad", "admin");
    await makeUser("rp-r");
    await makeUser("rp-a");
    await makeUser("rp-off", "membro", false);
    await makeUser("rp-x");
    await department("RP-uno", [{ userId: "rp-r", isManager: true }, { userId: "rp-a" }, { userId: "rp-off" }]);
    await department("RP-due", [{ userId: "rp-x" }]);
    const code = async (id: string) => (await getPerson(get(`/people/${id}`), idCtx(id))).status;
    await login("rp-r");
    assert.equal(await code("rp-a"), 200);
    assert.equal(await code("rp-x"), 404);
    assert.equal(await code("rp-off"), 404);
    assert.equal(await code("rp-r"), 404);
    assert.equal(await code("non-esiste"), 404);
    await login("rp-x");
    assert.equal(await code("rp-a"), 404);
    await login("rp-ad");
    assert.equal(await code("rp-off"), 200);
    const body = (await (await getPerson(get("/people/rp-a"), idCtx("rp-a"))).json()) as { person: { id: string; balances: unknown } };
    assert.equal(body.person.id, "rp-a");
    assert.ok(body.person.balances);
  });
});
