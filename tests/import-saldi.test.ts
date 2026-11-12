// Import di saldi e assenze da file. Tocca il database: eseguire con un DB di
// prova (mai quello di produzione, né il dev.db con i dati di prova):
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx tsx --test tests/import-saldi.test.ts
import "./helpers/headers-stub";
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { applyImport, parseImportFile, planImport } from "../src/lib/import-saldi";

const DIP = "imp-dipendente";
const PIVA = "imp-piva";

async function makeUser(id: string, employmentType: string) {
  await prisma.user.deleteMany({ where: { id } });
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@example.test`, passwordHash: "x", employmentType },
  });
}

const FILE = {
  formato: "softuerino-import-saldi",
  versione: 1,
  chiusure: [{ dal: "2030-08-14", al: "2030-08-16", nota: "Chiusura estiva" }],
  persone: [
    {
      email: `${DIP}@example.test`,
      bustaPaga: { mese: "2030-09", ferieOre: 22.42, rolOre: -8.97, ferieOreAnno: 86.67, rolOreAnno: 14.12, oreGiorno: 4 },
      richieste: [
        { tipo: "ferie", dal: "2030-01-23", al: "2030-01-23" },
        { tipo: "permesso", dal: "2030-10-15", ore: 2, dalle: "11:00", alle: "13:00" },
        // Già presente nel database (creata nel before): va saltata.
        { tipo: "ferie", dal: "2030-03-04", al: "2030-03-05" },
        // Solo weekend: saltata.
        { tipo: "ferie", dal: "2030-03-09", al: "2030-03-10" },
      ],
    },
    {
      email: `${PIVA}@example.test`,
      residuoAssenze: { anno: 2030, giorni: 20, alGiorno: "2030-11-04" },
      richieste: [
        // Tocca la chiusura del 14/08: si importa lo stesso, il 14 conta una volta.
        { tipo: "assenza", dal: "2030-08-12", al: "2030-08-14" },
        // Una partita IVA non ha ferie: saltata.
        { tipo: "ferie", dal: "2030-02-04", al: "2030-02-04" },
      ],
    },
    { nome: "Persona che non esiste" },
  ],
};

describe("import saldi e assenze", () => {
  before(async () => {
    await prisma.companyClosure.deleteMany({ where: { note: "Chiusura estiva", startDate: new Date(2030, 7, 14) } });
    await makeUser(DIP, "dipendente");
    await makeUser(PIVA, "partita_iva");
    await prisma.leaveRequest.create({
      data: { userId: DIP, type: "ferie", status: "approved", startDate: new Date(2030, 2, 4), endDate: new Date(2030, 2, 5) },
    });
  });

  it("rifiuta i file che non riconosce", () => {
    assert.ok("error" in parseImportFile("non json"));
    assert.ok("error" in parseImportFile(JSON.stringify({ formato: "altro", versione: 1, persone: [] })));
    const badType = { ...FILE, persone: [{ nome: "x", richieste: [{ tipo: "vacanza", dal: "2030-01-01" }] }] };
    assert.ok("error" in parseImportFile(JSON.stringify(badType)));
  });

  it("anteprima: dice cosa farebbe senza scrivere", async () => {
    const parsed = parseImportFile(JSON.stringify(FILE));
    assert.ok("data" in parsed);
    const before = await prisma.leaveRequest.count();
    const { report } = await planImport(parsed.data);
    assert.equal(await prisma.leaveRequest.count(), before);

    const dip = report.people.find((p) => p.name === `Nome ${DIP}`)!;
    assert.equal(dip.created.length, 2);
    assert.deepEqual(
      dip.skipped.map((s) => s.reason),
      ["c'è già una richiesta in queste date", "solo weekend o festivi"]
    );
    const piva = report.people.find((p) => p.name === `Nome ${PIVA}`)!;
    assert.equal(piva.created.length, 1);
    assert.equal(piva.skipped[0].reason, "tipo non previsto per il suo contratto");
    assert.ok(report.warnings.some((w) => w.includes("Persona che non esiste")));
    assert.deepEqual(report.closures.map((c) => c.action), ["crea"]);
  });

  it("applica: richieste, chiusura, busta paga e residuo", async () => {
    const parsed = parseImportFile(JSON.stringify(FILE));
    assert.ok("data" in parsed);
    await applyImport(await planImport(parsed.data));

    const start = await prisma.leaveBalanceStart.findFirstOrThrow({ where: { userId: DIP } });
    assert.equal(start.ferieHours, 22.42);
    assert.equal(start.rolHours, -8.97);
    // Assenza 12–14 agosto + chiusura 14–16 (il 14 una volta, il 15 è
    // Ferragosto) = 12, 13, 14, 16: 4 giorni usati al 4/11. Per averne 20, la
    // rettifica è 20 − 26 + 4 = −2.
    const adj = await prisma.leaveBalanceAdjustment.findFirstOrThrow({ where: { userId: PIVA, year: 2030 } });
    assert.equal(adj.amount, -2);
    assert.equal(await prisma.leaveRequest.count({ where: { userId: PIVA, type: "chiusura" } }), 1);
  });

  it("ricaricare lo stesso file non duplica niente", async () => {
    const parsed = parseImportFile(JSON.stringify(FILE));
    assert.ok("data" in parsed);
    const before = await prisma.leaveRequest.count();
    const plan = await planImport(parsed.data);
    assert.equal(plan.requests.length, 0);
    assert.equal(plan.closures.length, 0);
    await applyImport(plan);
    assert.equal(await prisma.leaveRequest.count(), before);
    const adj = await prisma.leaveBalanceAdjustment.findFirstOrThrow({ where: { userId: PIVA, year: 2030 } });
    assert.equal(adj.amount, -2);
  });
});
