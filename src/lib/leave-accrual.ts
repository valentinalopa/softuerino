// Maturazione e addebito dei saldi: funzioni pure, senza database, usate dal
// server (saldi, avvisi a chi approva) e dal form di richiesta nel browser.

// Primo giorno dopo il mese della busta paga: da qui contano maturato e
// goduto. `month` è un giorno qualunque del mese della busta.
export function accrualFrom(month: Date) {
  return new Date(month.getFullYear(), month.getMonth() + 1, 1);
}

// Mesi interi passati da `from` (1° del mese) ad `asOf`: un mese conta quando
// è finito, cioè dal 1° del mese dopo. Esempio: busta di settembre (from = 1°
// ottobre), oggi 11 novembre → 1 (ottobre).
export function monthsEnded(from: Date, asOf: Date) {
  let months = 0;
  let cursor = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  while (cursor <= asOf) {
    months++;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return months;
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

// Quanto una richiesta può scalare da un saldo, e come si calcola il
// disponibile a una certa data: base + perMonth × mesi finiti da `from`.
// - ferie (dipendenti): in ore, ogni giorno lavorativo vale perDay ore;
// - permesso: in ore, al massimo maxPerDay ore in un giorno;
// - assenza (partite IVA): in giorni, niente maturazione (perMonth 0); a ore
//   vale ore / dayHours di giornata, al massimo una giornata.
// base = residuo della busta (o monte dell'anno) meno tutto ciò che è già
// approvato, anche nei giorni futuri.
export type ChargeInfo = {
  unit: "h" | "gg";
  base: number;
  perMonth: number;
  from: Date | null;
  perDay: number | null;
  maxPerDay: number | null;
  // Saldo in giorni: ore di una giornata, per scalare una richiesta a ore.
  dayHours: number | null;
};

export type LeaveCharges = Partial<Record<"ferie" | "permesso" | "assenza", ChargeInfo>>;

export function availableAt(info: ChargeInfo, date: Date) {
  const accrued = info.from ? info.perMonth * monthsEnded(info.from, date) : 0;
  return round2(info.base + accrued);
}

// Quanto scala una richiesta: `days` giorni lavorativi o `hours` ore.
export function chargeAmount(info: ChargeInfo, request: { days: number; hours: number | null }) {
  if (request.hours !== null) {
    if (info.unit === "gg") {
      return info.dayHours ? round2(Math.min(request.hours, info.dayHours) / info.dayHours) : 0;
    }
    return round2(info.maxPerDay !== null ? Math.min(request.hours, info.maxPerDay) : request.hours);
  }
  return round2(info.perDay !== null ? request.days * info.perDay : request.days);
}

// Saldo che un tipo di richiesta scala, o null se è fuori monte (o se i saldi
// del dipendente non sono ancora impostati). La chiusura aziendale scala ferie
// o assenze, a seconda del contratto.
export function chargeKind(charges: LeaveCharges, type: string): keyof LeaveCharges | null {
  const charged = type === "chiusura" ? (charges.assenza ? "assenza" : "ferie") : type;
  return charged in charges ? (charged as keyof LeaveCharges) : null;
}

export function chargeFor(charges: LeaveCharges, type: string): ChargeInfo | null {
  const kind = chargeKind(charges, type);
  return kind ? (charges[kind] ?? null) : null;
}
