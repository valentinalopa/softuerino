// Saldi di ferie e ROL in ore, partendo dalla busta paga. Solo funzioni pure:
// il database non si tocca (DATABASE_URL serve solo per importare il modulo).
//   DATABASE_URL=file:./dev.db npx tsx --test tests/leave-balance.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { employeeBalance, hourUsage, tallyLeave } from "../src/lib/leave-balance";
import { accrualFrom, availableAt, chargeAmount, chargeFor, chargeKind, monthsEnded } from "../src/lib/leave-accrual";
import { countedLeaveDays, isHoliday, slotsClash } from "../src/lib/leave-days";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

type Req = {
  type: string;
  status: string;
  startDate: Date;
  endDate: Date;
  hours?: number | null;
};
const req = (r: Req) => ({ userId: "u", hours: null, ...r });

// Busta paga di settembre 2026: ferie 8,75 + 65 − 51,33 = 22,42; ROL −8,97.
// 65 ore in 9 mesi = 86,67 l'anno; ROL circa 14,12 l'anno. Part-time 4 h.
const START = {
  month: d(2026, 9, 1),
  ferieHours: 22.42,
  rolHours: -8.97,
  ferieHoursPerYear: (65 / 9) * 12,
  rolHoursPerYear: 14.12,
};
const NOW = d(2026, 11, 11);

describe("maturazione a fine mese", () => {
  const from = accrualFrom(d(2026, 9, 1));
  it("parte dal 1° del mese dopo la busta", () => {
    assert.deepEqual(from, d(2026, 10, 1));
  });
  it("conta un mese solo quando è finito", () => {
    assert.equal(monthsEnded(from, d(2026, 10, 31)), 0);
    assert.equal(monthsEnded(from, d(2026, 11, 1)), 1);
    assert.equal(monthsEnded(from, d(2026, 11, 11)), 1);
    assert.equal(monthsEnded(from, d(2027, 1, 1)), 3);
  });
});

describe("saldo dalla busta paga", () => {
  const requests = [
    // Prima della busta: già nel goduto della busta, non si conta.
    req({ type: "ferie", status: "approved", startDate: d(2026, 9, 14), endDate: d(2026, 9, 14) }),
    // Lun 12 e mar 13 ottobre: 2 giorni × 4 h.
    req({ type: "ferie", status: "approved", startDate: d(2026, 10, 12), endDate: d(2026, 10, 13) }),
    req({ type: "permesso", status: "approved", startDate: d(2026, 10, 20), endDate: d(2026, 10, 20), hours: 2 }),
    // In attesa e rifiutate non contano.
    req({ type: "ferie", status: "pending", startDate: d(2026, 10, 26), endDate: d(2026, 10, 26) }),
    req({ type: "ferie", status: "rejected", startDate: d(2026, 10, 27), endDate: d(2026, 10, 27) }),
    // Lun 28 e mar 29 dicembre: approvate ma ancora da godere.
    req({ type: "ferie", status: "approved", startDate: d(2026, 12, 28), endDate: d(2026, 12, 29) }),
  ];
  const { ferie, permesso, charges } = employeeBalance(START, 4, requests, NOW);

  it("ferie: residuo + maturato − goduto, come la busta", () => {
    assert.ok(ferie);
    assert.equal(ferie.accrued, 7.22);
    assert.equal(ferie.used, 8);
    assert.equal(ferie.remaining, 21.64);
    assert.equal(ferie.planned, 8);
    assert.equal(ferie.afterPlanned, 13.64);
  });
  it("ROL: anche il residuo negativo matura e si riporta", () => {
    assert.ok(permesso);
    assert.equal(permesso.accrued, 1.18);
    assert.equal(permesso.used, 2);
    assert.equal(permesso.remaining, -9.79);
  });
  it("le ferie prenotate più avanti non mandano in negativo il saldo di oggi", () => {
    assert.ok(ferie && ferie.remaining > 0);
  });
  it("disponibile a una data futura: con quanto sarà maturato fino ad allora", () => {
    const info = chargeFor(charges, "ferie");
    assert.ok(info);
    // 22,42 − 16 (tutte le ferie approvate) + 3 mesi (ott, nov, dic) × 7,22
    assert.equal(availableAt(info, d(2027, 1, 15)), 28.09);
    assert.equal(chargeAmount(info, { days: 3, hours: null }), 12);
  });
  it("un permesso scala al massimo le ore di una giornata", () => {
    const info = chargeFor(charges, "permesso");
    assert.ok(info);
    assert.equal(chargeAmount(info, { days: 1, hours: 9 }), 4);
    assert.equal(chargeAmount(info, { days: 1, hours: 2.5 }), 2.5);
  });
  it("la chiusura aziendale scala le ferie dei dipendenti", () => {
    assert.equal(chargeFor(charges, "chiusura")?.unit, "h");
    assert.equal(chargeFor(charges, "malattia"), null);
  });
  it("senza busta paga i saldi non ci sono", () => {
    const empty = employeeBalance(null, 4, requests, NOW);
    assert.equal(empty.ferie, null);
    assert.deepEqual(empty.charges, {});
  });
});

describe("goduto in ore", () => {
  const from = d(2026, 10, 1);
  it("ferie e chiusura nello stesso giorno contano una volta; festivi esclusi", () => {
    const usage = hourUsage(
      [
        req({ type: "ferie", status: "approved", startDate: d(2026, 12, 7), endDate: d(2026, 12, 9) }),
        req({ type: "chiusura", status: "approved", startDate: d(2026, 12, 9), endDate: d(2026, 12, 9) }),
      ],
      from,
      NOW,
      4
    );
    // 7 e 9 dicembre (l'8 è festa): 2 giorni × 4 h.
    assert.equal(usage.feriePlanned, 8);
  });
  it("un permesso nei giorni di ferie o chiusura non si scala", () => {
    const usage = hourUsage(
      [
        req({ type: "chiusura", status: "approved", startDate: d(2026, 10, 30), endDate: d(2026, 10, 30) }),
        req({ type: "permesso", status: "approved", startDate: d(2026, 10, 30), endDate: d(2026, 10, 30), hours: 2 }),
      ],
      from,
      NOW,
      4
    );
    assert.equal(usage.ferieTaken, 4);
    assert.equal(usage.permessoTaken, 0);
  });
  it("più permessi nello stesso giorno si fermano alle ore della giornata", () => {
    const usage = hourUsage(
      [
        req({ type: "permesso", status: "approved", startDate: d(2026, 10, 21), endDate: d(2026, 10, 21), hours: 3 }),
        req({ type: "permesso", status: "approved", startDate: d(2026, 10, 21), endDate: d(2026, 10, 21), hours: 3 }),
      ],
      from,
      NOW,
      4
    );
    assert.equal(usage.permessoTaken, 4);
  });
});

describe("sovrapposizioni tra richieste", () => {
  it("due fasce separate nello stesso giorno vanno bene", () => {
    assert.equal(slotsClash({ startTime: "09:00", endTime: "11:00" }, { startTime: "15:00", endTime: "17:00" }), false);
    assert.equal(slotsClash({ startTime: "09:00", endTime: "11:00" }, { startTime: "11:00", endTime: "13:00" }), false);
  });
  it("fasce che si toccano si scontrano", () => {
    assert.equal(slotsClash({ startTime: "09:00", endTime: "11:00" }, { startTime: "10:30", endTime: "12:00" }), true);
  });
  it("una richiesta a giornata si scontra con tutto", () => {
    assert.equal(slotsClash({}, { startTime: "09:00", endTime: "11:00" }), true);
    assert.equal(slotsClash({}, {}), true);
  });
});

describe("assenze a ore delle partite IVA", () => {
  const yearStart = d(2026, 1, 1);
  const yearEnd = d(2026, 12, 31);
  const piva = () => "partita_iva";
  const four = () => 4;
  it("2 ore su una giornata di 4 valgono mezza giornata", () => {
    const tally = tallyLeave(
      [req({ type: "assenza", status: "approved", startDate: d(2026, 1, 29), endDate: d(2026, 1, 29), hours: 2 })],
      yearStart,
      yearEnd,
      piva,
      four
    );
    assert.equal(tally.assenzaDays, 0.5);
  });
  it("più assenze a ore nello stesso giorno si fermano a una giornata", () => {
    const tally = tallyLeave(
      [
        req({ type: "assenza", status: "approved", startDate: d(2026, 2, 2), endDate: d(2026, 2, 2), hours: 3 }),
        req({ type: "assenza", status: "approved", startDate: d(2026, 2, 2), endDate: d(2026, 2, 2), hours: 3 }),
      ],
      yearStart,
      yearEnd,
      piva,
      four
    );
    assert.equal(tally.assenzaDays, 1);
  });
  it("un'assenza a ore in un giorno di chiusura non si scala di nuovo", () => {
    const tally = tallyLeave(
      [
        req({ type: "chiusura", status: "approved", startDate: d(2026, 12, 28), endDate: d(2026, 12, 28) }),
        req({ type: "assenza", status: "approved", startDate: d(2026, 12, 28), endDate: d(2026, 12, 28), hours: 2 }),
      ],
      yearStart,
      yearEnd,
      piva,
      four
    );
    assert.equal(tally.assenzaDays, 1);
  });
  it("nel form: scala ore / ore della giornata, al massimo una giornata", () => {
    const info = { unit: "gg" as const, base: 12, perMonth: 0, from: null, perDay: null, maxPerDay: null, dayHours: 4 };
    assert.equal(chargeAmount(info, { days: 1, hours: 2 }), 0.5);
    assert.equal(chargeAmount(info, { days: 1, hours: 6 }), 1);
    assert.equal(chargeAmount(info, { days: 3, hours: null }), 3);
  });
});

describe("fuori monte: permessi 104", () => {
  const yearStart = d(2026, 1, 1);
  const yearEnd = d(2026, 12, 31);
  const tally = tallyLeave(
    [
      req({ type: "permesso_104", status: "approved", startDate: d(2026, 3, 2), endDate: d(2026, 3, 2) }),
      req({ type: "permesso_104", status: "approved", startDate: d(2026, 3, 4), endDate: d(2026, 3, 4), hours: 2 }),
      req({ type: "permesso_104", status: "pending", startDate: d(2026, 3, 3), endDate: d(2026, 3, 3) }),
    ],
    yearStart,
    yearEnd,
    () => "dipendente"
  );
  it("si contano a parte, a giorni e a ore", () => {
    assert.equal(tally.permesso104Days, 1);
    assert.equal(tally.permesso104Hours, 2);
  });
  it("non scalano ferie né ROL", () => {
    assert.equal(tally.ferieUsed, 0);
    assert.equal(tally.permessoUsed, 0);
  });
  it("non toccano il saldo in ore del dipendente", () => {
    const { ferie, permesso } = employeeBalance(
      START,
      4,
      [req({ type: "permesso_104", status: "approved", startDate: d(2026, 10, 5), endDate: d(2026, 10, 5) })],
      NOW
    );
    assert.equal(ferie?.used, 0);
    assert.equal(permesso?.used, 0);
  });
});

describe("feste nazionali", () => {
  it("Pasqua e Pasquetta sono feste (2026: 5 e 6 aprile)", () => {
    assert.equal(isHoliday(d(2026, 4, 5)), true);
    assert.equal(isHoliday(d(2026, 4, 6)), true);
    assert.equal(isHoliday(d(2026, 4, 7)), false);
    // Ferie da giovedì 2 a martedì 7 aprile: 2, 3 e 7 (weekend, Pasqua e Pasquetta esclusi).
    assert.equal(countedLeaveDays(d(2026, 4, 2), d(2026, 4, 7)), 3);
  });
  it("le ferie a cavallo di una festa non la contano", () => {
    // 7, 8 (Immacolata) e 9 dicembre 2026: 2 giorni.
    assert.equal(countedLeaveDays(d(2026, 12, 7), d(2026, 12, 9)), 2);
  });
  it("un permesso in un giorno festivo non scala il ROL", () => {
    const usage = hourUsage(
      [req({ type: "permesso", status: "approved", startDate: d(2026, 12, 8), endDate: d(2026, 12, 8), hours: 2 })],
      d(2026, 10, 1),
      NOW,
      4
    );
    assert.equal(usage.permessoPlanned, 0);
  });
  it("un'assenza a ore di una partita IVA in un festivo non conta", () => {
    const tally = tallyLeave(
      [req({ type: "assenza", status: "approved", startDate: d(2026, 4, 6), endDate: d(2026, 4, 6), hours: 2 })],
      d(2026, 1, 1),
      d(2026, 12, 31),
      () => "partita_iva"
    );
    // 6 aprile 2026 è Pasquetta.
    assert.equal(tally.assenzaDays, 0);
  });
  it("le chiusure aziendali non contano i festivi", () => {
    const tally = tallyLeave(
      [req({ type: "chiusura", status: "approved", startDate: d(2026, 12, 24), endDate: d(2026, 12, 31) })],
      d(2026, 1, 1),
      d(2026, 12, 31),
      () => "partita_iva"
    );
    // 24, 28, 29, 30, 31: Natale, Santo Stefano e il weekend esclusi.
    assert.equal(tally.assenzaDays, 5);
  });
});

describe("avvisi a chi approva", () => {
  it("ferie e ROL hanno saldi separati anche se entrambi in ore", () => {
    const charges = employeeBalance(START, 4, [], NOW).charges;
    assert.equal(chargeKind(charges, "ferie"), "ferie");
    assert.equal(chargeKind(charges, "permesso"), "permesso");
    assert.equal(chargeKind(charges, "chiusura"), "ferie");
    assert.equal(chargeKind(charges, "malattia"), null);
  });
});
