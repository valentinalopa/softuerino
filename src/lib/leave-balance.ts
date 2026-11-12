import { prisma } from "@/lib/prisma";
import {
  DEFAULT_DAILY_HOURS,
  PARTITA_IVA_ASSENZE_DAYS_PER_YEAR,
  type BalanceKind,
  type EmploymentType,
} from "@/lib/constants";
import {
  clippedDayKeysInRange,
  clippedDaysInRange,
  countedLeaveDays,
  dayKey,
  workingDates,
  isWorkingDay,
} from "@/lib/leave-days";
import {
  accrualFrom,
  availableAt,
  chargeAmount,
  chargeKind,
  monthsEnded,
  round2,
  type LeaveCharges,
} from "@/lib/leave-accrual";
import { formatAmount } from "@/lib/leave-format";

export type LeaveTally = {
  ferieUsed: number;
  permessoUsed: number;
  malattiaDays: number;
  assenzaDays: number;
  // Fuori monte: contati solo per le statistiche, non scalano il saldo.
  recuperoDays: number;
  recuperoHours: number;
  assenzaExtraDays: number;
  permesso104Days: number;
  permesso104Hours: number;
};

type TallyableRequest = {
  userId: string;
  type: string;
  status: string;
  startDate: Date;
  endDate: Date;
  hours: number | null;
};

// Unica sede della regola di classificazione ferie/permesso/malattia: usata sia
// dal saldo individuale sia dagli aggregati di team (panoramica).
// La chiusura aziendale scala le ferie dei dipendenti e le assenze delle
// partite IVA (employmentType della persona). Ferie/assenze e chiusure si
// contano per giorno e per persona, così un giorno coperto da entrambe (es.
// ferie già approvate dentro una chiusura) si scala una volta sola.
export function tallyLeave(
  requests: TallyableRequest[],
  yearStart: Date,
  yearEnd: Date,
  employmentTypeOf: (userId: string) => string | undefined,
  dailyHoursOf: (userId: string) => number = () => DEFAULT_DAILY_HOURS
): LeaveTally {
  const ferieDays = new Set<string>();
  const assenzaDaysSet = new Set<string>();
  let permessoUsed = 0;
  let malattiaDays = 0;
  let recuperoDays = 0;
  let recuperoHours = 0;
  let assenzaExtraDays = 0;
  // Permesso 104: fuori monte, a giorni o a ore come il recupero.
  const permesso104 = { days: 0, hours: 0 };

  // Assenze a ore delle partite IVA: ore per persona e giorno, poi frazione
  // di giornata (ore / ore della giornata, al massimo 1).
  const assenzaHours = new Map<string, number>();

  const addDays = (target: Set<string>, request: TallyableRequest) => {
    for (const key of clippedDayKeysInRange(request.startDate, request.endDate, yearStart, yearEnd)) {
      target.add(`${request.userId}|${key}`);
    }
  };

  for (const request of requests) {
    // A ore in un giorno festivo o nel weekend: non pesa su nessun conteggio.
    if (request.hours !== null && !isWorkingDay(request.startDate)) continue;
    if (request.type === "ferie" && request.status === "approved") {
      addDays(ferieDays, request);
    } else if (request.type === "chiusura" && request.status === "approved") {
      addDays(
        employmentTypeOf(request.userId) === "partita_iva" ? assenzaDaysSet : ferieDays,
        request
      );
    } else if (request.type === "permesso" && request.status === "approved") {
      permessoUsed += request.hours ?? 0;
    } else if (request.type === "malattia" && request.status === "registrata") {
      malattiaDays += clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd);
    } else if (request.type === "assenza" && request.status === "approved") {
      if (request.hours !== null) {
        for (const key of clippedDayKeysInRange(request.startDate, request.endDate, yearStart, yearEnd)) {
          const dayId = `${request.userId}|${key}`;
          assenzaHours.set(dayId, (assenzaHours.get(dayId) ?? 0) + request.hours);
        }
      } else {
        addDays(assenzaDaysSet, request);
      }
    } else if (request.type === "recupero" && request.status === "approved") {
      if (request.hours !== null) {
        recuperoHours += request.hours;
      } else {
        recuperoDays += clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd);
      }
    } else if (request.type === "assenza_extra" && request.status === "approved") {
      assenzaExtraDays += clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd);
    } else if (request.type === "permesso_104" && request.status === "approved") {
      if (request.hours !== null) {
        if (clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd) > 0) {
          permesso104.hours += request.hours;
        }
      } else {
        permesso104.days += clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd);
      }
    }
  }

  // Un'assenza a ore in un giorno già coperto (assenza intera o chiusura)
  // non si scala di nuovo.
  let assenzaPartialDays = 0;
  for (const [dayId, hours] of assenzaHours) {
    if (assenzaDaysSet.has(dayId)) continue;
    const userId = dayId.slice(0, dayId.indexOf("|"));
    assenzaPartialDays += Math.min(hours / dailyHoursOf(userId), 1);
  }

  return {
    ferieUsed: ferieDays.size,
    permessoUsed,
    malattiaDays,
    assenzaDays: Math.round((assenzaDaysSet.size + assenzaPartialDays) * 100) / 100,
    recuperoDays,
    recuperoHours,
    assenzaExtraDays,
    permesso104Days: permesso104.days,
    permesso104Hours: permesso104.hours,
  };
}


// --- Saldi ---

// Saldo in ore di un dipendente (ferie o ROL), confrontabile con la busta paga:
// residuo della busta + maturato da allora − goduto da allora = residuo oggi.
// planned = già approvato nei giorni che devono ancora venire: non è goduto,
// ma va tolto per sapere quanto resta da chiedere.
export type HourBalance = {
  start: number;
  perYear: number;
  perMonth: number;
  accrued: number;
  used: number;
  remaining: number;
  planned: number;
  afterPlanned: number;
};

export type LeaveBalance =
  | {
      kind: "dipendente";
      dailyHours: number;
      // Mese della busta paga da cui partono i saldi; null = non ancora
      // impostati dal super admin (ferie e permesso restano vuoti).
      startMonth: Date | null;
      ferie: HourBalance | null;
      permesso: HourBalance | null;
      malattiaDaysRegistered: number;
      // Fuori monte nell'anno, solo informativi.
      recuperoDays: number;
      recuperoHours: number;
      permesso104Days: number;
      permesso104Hours: number;
      charges: LeaveCharges;
    }
  | {
      kind: "assenze";
      assenzeAllowance: number;
      assenzeUsed: number;
      assenzeRemaining: number;
      // Fuori monte, solo informativi.
      recuperoDays: number;
      recuperoHours: number;
      assenzaExtraDays: number;
      charges: LeaveCharges;
    };

type BalanceStart = {
  month: Date;
  ferieHours: number;
  rolHours: number;
  ferieHoursPerYear: number;
  rolHoursPerYear: number;
};

type UsageRequest = TallyableRequest & { startTime?: string | null };

export type HourUsage = {
  ferieTaken: number;
  feriePlanned: number;
  permessoTaken: number;
  permessoPlanned: number;
};

// Ore di ferie e permesso approvate da `from` in poi, divise tra godute (fino
// a oggi compreso) e programmate (dopo oggi). Ogni giorno lavorativo di ferie
// o di chiusura aziendale vale dailyHours, contato una volta sola. I permessi
// di un giorno si sommano fino a dailyHours, e non contano nei giorni già
// coperti da ferie o chiusura.
export function hourUsage(
  requests: UsageRequest[],
  from: Date,
  today: Date,
  dailyHours: number
): HourUsage {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const ferieDays = new Map<string, Date>();
  for (const r of requests) {
    if (r.status !== "approved" || (r.type !== "ferie" && r.type !== "chiusura")) continue;
    for (const date of workingDates(r.startDate, r.endDate)) {
      if (date >= from) ferieDays.set(dayKey(date), date);
    }
  }
  const permessoByDay = new Map<string, { date: Date; hours: number }>();
  for (const r of requests) {
    if (r.status !== "approved" || r.type !== "permesso" || r.hours === null) continue;
    const date = new Date(r.startDate.getFullYear(), r.startDate.getMonth(), r.startDate.getDate());
    const key = dayKey(date);
    // Festivi e weekend non pesano, come per le ferie.
    if (date < from || ferieDays.has(key) || !isWorkingDay(date)) continue;
    const current = permessoByDay.get(key) ?? { date, hours: 0 };
    current.hours = Math.min(current.hours + r.hours, dailyHours);
    permessoByDay.set(key, current);
  }

  const usage: HourUsage = { ferieTaken: 0, feriePlanned: 0, permessoTaken: 0, permessoPlanned: 0 };
  for (const date of ferieDays.values()) {
    if (date <= todayStart) usage.ferieTaken += dailyHours;
    else usage.feriePlanned += dailyHours;
  }
  for (const { date, hours } of permessoByDay.values()) {
    if (date <= todayStart) usage.permessoTaken += hours;
    else usage.permessoPlanned += hours;
  }
  return {
    ferieTaken: round2(usage.ferieTaken),
    feriePlanned: round2(usage.feriePlanned),
    permessoTaken: round2(usage.permessoTaken),
    permessoPlanned: round2(usage.permessoPlanned),
  };
}

function hourBalance(start: number, perYear: number, from: Date, now: Date, used: number, planned: number): HourBalance {
  const perMonth = perYear / 12;
  const accrued = round2(perMonth * monthsEnded(from, now));
  const remaining = round2(start + accrued - used);
  return {
    start,
    perYear,
    perMonth: round2(perMonth),
    accrued,
    used,
    remaining,
    planned,
    afterPlanned: round2(remaining - planned),
  };
}

// Saldo di un dipendente al momento `now`, partendo dall'ultima busta paga.
export function employeeBalance(
  start: BalanceStart | null,
  dailyHours: number,
  requests: UsageRequest[],
  now: Date
) {
  if (!start) return { ferie: null, permesso: null, charges: {} as LeaveCharges };
  const from = accrualFrom(start.month);
  const usage = hourUsage(requests, from, now, dailyHours);
  const ferie = hourBalance(start.ferieHours, start.ferieHoursPerYear, from, now, usage.ferieTaken, usage.feriePlanned);
  const permesso = hourBalance(start.rolHours, start.rolHoursPerYear, from, now, usage.permessoTaken, usage.permessoPlanned);
  const charges: LeaveCharges = {
    ferie: {
      unit: "h",
      base: round2(start.ferieHours - usage.ferieTaken - usage.feriePlanned),
      perMonth: start.ferieHoursPerYear / 12,
      from,
      perDay: dailyHours,
      maxPerDay: null,
      dayHours: null,
    },
    permesso: {
      unit: "h",
      base: round2(start.rolHours - usage.permessoTaken - usage.permessoPlanned),
      perMonth: start.rolHoursPerYear / 12,
      from,
      perDay: null,
      maxPerDay: dailyHours,
      dayHours: null,
    },
  };
  return { ferie, permesso, charges };
}

function yearRange(year: number) {
  return {
    yearStart: new Date(year, 0, 1),
    yearEnd: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

export async function getLeaveBalance(
  userId: string,
  employmentType: EmploymentType,
  year: number = new Date().getFullYear()
): Promise<LeaveBalance> {
  const balances = await getLeaveBalancesForUsers([{ id: userId, employmentType }], year);
  return balances.get(userId)!;
}

// Versione batch: poche query per tutti gli utenti invece di una a testa
// (la pagina Team la usa per evitare l'N+1 sui membri). `year` vale per le
// partite IVA e per i conteggi informativi (malattia, recuperi); i saldi in
// ore dei dipendenti sono sempre quelli di oggi.
export async function getLeaveBalancesForUsers(
  users: { id: string; employmentType: EmploymentType }[],
  year: number = new Date().getFullYear()
): Promise<Map<string, LeaveBalance>> {
  const now = new Date();
  const userIds = users.map((u) => u.id);
  const { yearStart, yearEnd } = yearRange(year);
  const rows = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      dailyHours: true,
      balanceAdjustments: {
        where: { year, kind: "assenze" },
        select: { amount: true },
      },
      balanceStarts: {
        orderBy: { month: "desc" },
        take: 1,
        select: { month: true, ferieHours: true, rolHours: true, ferieHoursPerYear: true, rolHoursPerYear: true },
      },
    },
  });
  const rowById = new Map(rows.map((row) => [row.id, row]));

  // Richieste dall'inizio dell'anno (o dal mese dopo la busta, se prima) in
  // poi, senza limite: le ferie già approvate nei mesi futuri contano come
  // programmate.
  const earliest = rows.reduce((min, row) => {
    const start = row.balanceStarts[0];
    if (!start) return min;
    const from = accrualFrom(start.month);
    return from < min ? from : min;
  }, yearStart);
  const requests = await prisma.leaveRequest.findMany({
    where: { userId: { in: userIds }, endDate: { gte: earliest } },
  });
  const byUser = new Map<string, typeof requests>();
  for (const request of requests) {
    const list = byUser.get(request.userId);
    if (list) list.push(request);
    else byUser.set(request.userId, [request]);
  }

  return new Map(
    users.map((user): [string, LeaveBalance] => {
      const row = rowById.get(user.id);
      const own = byUser.get(user.id) ?? [];
      const dailyHours = row?.dailyHours ?? DEFAULT_DAILY_HOURS;
      const tally = tallyLeave(own, yearStart, yearEnd, () => user.employmentType, () => dailyHours);
      if (user.employmentType === "partita_iva") {
        const allowance = PARTITA_IVA_ASSENZE_DAYS_PER_YEAR + (row?.balanceAdjustments[0]?.amount ?? 0);
        const remaining = round2(allowance - tally.assenzaDays);
        const balance: LeaveBalance = {
          kind: "assenze",
          assenzeAllowance: round2(allowance),
          assenzeUsed: round2(tally.assenzaDays),
          assenzeRemaining: remaining,
          recuperoDays: tally.recuperoDays,
          recuperoHours: round2(tally.recuperoHours),
          assenzaExtraDays: tally.assenzaExtraDays,
          charges: {
            assenza: { unit: "gg", base: remaining, perMonth: 0, from: null, perDay: null, maxPerDay: null, dayHours: dailyHours },
          },
        };
        return [user.id, balance];
      }
      const start = row?.balanceStarts[0] ?? null;
      const { ferie, permesso, charges } = employeeBalance(start, dailyHours, own, now);
      const balance: LeaveBalance = {
        kind: "dipendente",
        dailyHours,
        startMonth: start?.month ?? null,
        ferie,
        permesso,
        malattiaDaysRegistered: tally.malattiaDays,
        recuperoDays: tally.recuperoDays,
        recuperoHours: round2(tally.recuperoHours),
        permesso104Days: tally.permesso104Days,
        permesso104Hours: round2(tally.permesso104Hours),
        charges,
      };
      return [user.id, balance];
    })
  );
}

// Residuo per saldo (solo quelli del contratto del membro): dati semplici per
// le barrette di Team e della scheda membro. `reference` è il monte annuale,
// `missing` = saldi del dipendente non ancora impostati dalla busta paga.
export type BalanceFigures = {
  remaining: number;
  used: number;
  reference: number;
  referenceNote?: string;
  planned?: number;
  missing?: boolean;
};

function hourFigures(balance: HourBalance | null, dailyHours: number, label: string): BalanceFigures {
  if (!balance) return { remaining: 0, used: 0, reference: 0, missing: true };
  return {
    remaining: balance.remaining,
    used: balance.used,
    reference: balance.perYear,
    referenceNote: `${formatAmount(balance.perMonth)} h al mese${label === "ferie" ? ` · ${formatAmount(dailyHours)} h al giorno` : ""}`,
    planned: balance.planned,
  };
}

export function balanceFigures(balance: LeaveBalance): Partial<Record<BalanceKind, BalanceFigures>> {
  return balance.kind === "assenze"
    ? {
        assenze: {
          remaining: balance.assenzeRemaining,
          used: balance.assenzeUsed,
          reference: PARTITA_IVA_ASSENZE_DAYS_PER_YEAR,
        },
      }
    : {
        ferie: hourFigures(balance.ferie, balance.dailyHours, "ferie"),
        permesso: hourFigures(balance.permesso, balance.dailyHours, "permesso"),
      };
}

// Fuori monte nell'anno (recuperi goduti, malattia, permessi 104, assenze
// extra): solo informativi, non scalano i saldi.
// `sensitive`: dati sanitari, da non mostrare a chi non è admin.
export type OutsideAllowanceItem = { label: string; value: number; unit: string; sensitive?: boolean };

export function outsideAllowance(balance: LeaveBalance): OutsideAllowanceItem[] {
  const common: OutsideAllowanceItem[] = [
    { label: "Recuperi goduti", value: balance.recuperoDays, unit: "gg" },
    { label: "Recuperi goduti (ore)", value: balance.recuperoHours, unit: "h" },
  ];
  return balance.kind === "assenze"
    ? [...common, { label: "Assenze extra", value: balance.assenzaExtraDays, unit: "gg" }]
    : [
        ...common,
        { label: "Malattia", value: balance.malattiaDaysRegistered, unit: "gg", sensitive: true },
        { label: "Permessi 104", value: balance.permesso104Days, unit: "gg", sensitive: true },
        { label: "Permessi 104 (ore)", value: balance.permesso104Hours, unit: "h", sensitive: true },
      ];
}

type PendingRequest = {
  id: string;
  type: string;
  startDate: Date;
  endDate: Date;
  hours: number | null;
  userId: string;
  user: { employmentType: string };
};

// Richieste in attesa che, se approvate, portano il saldo in negativo: non si
// bloccano, ma chi approva va avvisato. Il disponibile si guarda alla data
// della richiesta (con quanto sarà maturato fino ad allora), meno tutto ciò
// che è già approvato e le richieste in attesa dello stesso membro che
// vengono prima.
export async function getPendingOverdrafts(requests: PendingRequest[]) {
  const users = [...new Map(requests.map((r) => [r.userId, r.user.employmentType])).entries()];
  const balances = await getLeaveBalancesForUsers(
    users.map(([id, employmentType]) => ({ id, employmentType: employmentType as EmploymentType }))
  );

  const pendingSoFar = new Map<string, number>();
  const warnings = new Map<string, string>();
  const ordered = [...requests].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  for (const request of ordered) {
    const charges = balances.get(request.userId)!.charges;
    const kind = chargeKind(charges, request.type);
    const info = kind ? charges[kind] : undefined;
    if (!kind || !info) continue;
    // Un totale per saldo: ferie e ROL sono entrambi in ore, ma separati.
    const key = `${request.userId}:${kind}`;
    const amount = chargeAmount(info, {
      days: countedLeaveDays(request.startDate, request.endDate),
      hours: request.hours !== null && !isWorkingDay(request.startDate) ? 0 : request.hours,
    });
    const total = (pendingSoFar.get(key) ?? 0) + amount;
    pendingSoFar.set(key, total);
    const after = round2(availableAt(info, request.endDate) - total);
    if (after < 0) {
      warnings.set(request.id, `Se approvata, il saldo va in negativo: ${formatAmount(after)} ${info.unit}`);
    }
  }
  return warnings;
}
