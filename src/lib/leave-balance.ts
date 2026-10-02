import { prisma } from "@/lib/prisma";
import {
  LEAVE_ALLOWANCE_BY_EMPLOYMENT_TYPE,
  type BalanceKind,
  type EmploymentType,
} from "@/lib/constants";
import { clippedDaysInRange } from "@/lib/leave-days";

export type LeaveTally = {
  ferieUsed: number;
  permessoUsed: number;
  malattiaDays: number;
  assenzaDays: number;
  // Fuori monte: contati solo per le statistiche, non scalano il saldo.
  recuperoDays: number;
  recuperoHours: number;
  assenzaExtraDays: number;
};

type TallyableRequest = {
  type: string;
  status: string;
  startDate: Date;
  endDate: Date;
  hours: number | null;
};

// Unica sede della regola di classificazione ferie/permesso/malattia: usata sia
// dal saldo individuale sia dagli aggregati di team (panoramica).
export function tallyLeave(
  requests: TallyableRequest[],
  yearStart: Date,
  yearEnd: Date
): LeaveTally {
  let ferieUsed = 0;
  let permessoUsed = 0;
  let malattiaDays = 0;
  let assenzaDays = 0;
  let recuperoDays = 0;
  let recuperoHours = 0;
  let assenzaExtraDays = 0;

  for (const request of requests) {
    if (request.type === "ferie" && request.status === "approved") {
      ferieUsed += clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd);
    } else if (request.type === "permesso" && request.status === "approved") {
      permessoUsed += request.hours ?? 0;
    } else if (request.type === "malattia" && request.status === "registrata") {
      malattiaDays += clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd);
    } else if (request.type === "assenza" && request.status === "approved") {
      assenzaDays += clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd);
    } else if (request.type === "recupero" && request.status === "approved") {
      if (request.hours !== null) {
        recuperoHours += request.hours;
      } else {
        recuperoDays += clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd);
      }
    } else if (request.type === "assenza_extra" && request.status === "approved") {
      assenzaExtraDays += clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd);
    }
  }

  return {
    ferieUsed,
    permessoUsed,
    malattiaDays,
    assenzaDays,
    recuperoDays,
    recuperoHours,
    assenzaExtraDays,
  };
}

// Dipendenti: ferie (giorni) + permessi (ore) + malattia senza tetto.
// Partite IVA: un unico monte "assenze" in giorni.
// Allowance = disponibile nell'anno: monte annuale + residuo riportato (o
// rettifica del super admin).
export type LeaveBalance =
  | {
      kind: "dipendente";
      ferieAllowance: number;
      ferieUsed: number;
      ferieRemaining: number;
      permessoAllowance: number;
      permessoUsed: number;
      permessoRemaining: number;
      malattiaDaysRegistered: number;
    }
  | {
      kind: "assenze";
      assenzeAllowance: number;
      assenzeUsed: number;
      assenzeRemaining: number;
    };

type BalanceAdjustment = { kind: string; year: number; amount: number };

// Contesto per il calcolo: da quando l'utente esiste (punto di partenza del
// riporto se non ci sono rettifiche) e le rettifiche del super admin.
type BalanceSubject = {
  employmentType: EmploymentType;
  createdAt: Date;
  adjustments: BalanceAdjustment[];
};

// Evita residui tipo 2.4999999999 sommando mezze giornate e ore decimali.
function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function yearRange(year: number) {
  return {
    yearStart: new Date(year, 0, 1),
    yearEnd: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

// Anno da cui parte il riporto di un saldo da dipendente: l'ultima rettifica
// fino a `year` (che fissa il residuo di quell'anno), altrimenti l'anno di
// creazione dell'utente.
function carryBaseline(subject: BalanceSubject, kind: BalanceKind, year: number) {
  const latest = subject.adjustments
    .filter((a) => a.kind === kind && a.year <= year)
    .sort((a, b) => b.year - a.year)[0];
  if (latest) return { baseYear: latest.year, baseAmount: latest.amount };
  return { baseYear: Math.min(subject.createdAt.getFullYear(), year), baseAmount: 0 };
}

// Primo anno di cui servono le richieste per calcolare il saldo di `year`.
function firstYearNeeded(subject: BalanceSubject, year: number) {
  if (subject.employmentType === "partita_iva") return year;
  return Math.min(
    carryBaseline(subject, "ferie", year).baseYear,
    carryBaseline(subject, "permesso", year).baseYear
  );
}

// Saldo da dipendente con riporto: l'anno base vale monte + rettifica, ogni
// anno successivo monte + residuo dell'anno prima.
function carriedBalance(
  subject: BalanceSubject,
  kind: "ferie" | "permesso",
  perYear: number,
  year: number,
  tallyFor: (y: number) => LeaveTally
) {
  const { baseYear, baseAmount } = carryBaseline(subject, kind, year);
  const usedIn = (y: number) => (kind === "ferie" ? tallyFor(y).ferieUsed : tallyFor(y).permessoUsed);

  let allowance = perYear + baseAmount;
  let used = usedIn(baseYear);
  for (let y = baseYear + 1; y <= year; y++) {
    allowance = perYear + (allowance - used);
    used = usedIn(y);
  }
  return {
    allowance: round2(allowance),
    used: round2(used),
    remaining: round2(allowance - used),
  };
}

function computeBalance(
  subject: BalanceSubject,
  requests: TallyableRequest[],
  year: number
): LeaveBalance {
  const tallies = new Map<number, LeaveTally>();
  const tallyFor = (y: number) => {
    let tally = tallies.get(y);
    if (!tally) {
      const { yearStart, yearEnd } = yearRange(y);
      tally = tallyLeave(requests, yearStart, yearEnd);
      tallies.set(y, tally);
    }
    return tally;
  };

  if (subject.employmentType === "partita_iva") {
    // Nessun riporto: vale solo la rettifica dell'anno stesso.
    const adjustment =
      subject.adjustments.find((a) => a.kind === "assenze" && a.year === year)?.amount ?? 0;
    const allowance = LEAVE_ALLOWANCE_BY_EMPLOYMENT_TYPE.partita_iva.assenzeDaysPerYear + adjustment;
    const used = tallyFor(year).assenzaDays;
    return {
      kind: "assenze",
      assenzeAllowance: round2(allowance),
      assenzeUsed: round2(used),
      assenzeRemaining: round2(allowance - used),
    };
  }

  const monte = LEAVE_ALLOWANCE_BY_EMPLOYMENT_TYPE.dipendente;
  const ferie = carriedBalance(subject, "ferie", monte.ferieDaysPerYear, year, tallyFor);
  const permesso = carriedBalance(subject, "permesso", monte.permessoHoursPerYear, year, tallyFor);
  return {
    kind: "dipendente",
    ferieAllowance: ferie.allowance,
    ferieUsed: ferie.used,
    ferieRemaining: ferie.remaining,
    permessoAllowance: permesso.allowance,
    permessoUsed: permesso.used,
    permessoRemaining: permesso.remaining,
    malattiaDaysRegistered: tallyFor(year).malattiaDays,
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
// (la pagina Team la usa per evitare l'N+1 sui membri).
export async function getLeaveBalancesForUsers(
  users: { id: string; employmentType: EmploymentType }[],
  year: number = new Date().getFullYear()
): Promise<Map<string, LeaveBalance>> {
  const userIds = users.map((u) => u.id);
  const rows = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      createdAt: true,
      balanceAdjustments: {
        where: { year: { lte: year } },
        select: { kind: true, year: true, amount: true },
      },
    },
  });
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const subjects = new Map<string, BalanceSubject>(
    users.map((user) => {
      const row = rowById.get(user.id);
      return [
        user.id,
        {
          employmentType: user.employmentType,
          createdAt: row?.createdAt ?? new Date(year, 0, 1),
          adjustments: row?.balanceAdjustments ?? [],
        },
      ];
    })
  );

  // Il riporto dei dipendenti richiede anche le richieste degli anni prima.
  const fromYear = Math.min(
    year,
    ...[...subjects.values()].map((subject) => firstYearNeeded(subject, year))
  );
  const requests = await prisma.leaveRequest.findMany({
    where: {
      userId: { in: userIds },
      startDate: { lte: yearRange(year).yearEnd },
      endDate: { gte: yearRange(fromYear).yearStart },
    },
  });

  const byUser = new Map<string, typeof requests>();
  for (const request of requests) {
    const list = byUser.get(request.userId);
    if (list) {
      list.push(request);
    } else {
      byUser.set(request.userId, [request]);
    }
  }

  return new Map(
    users.map((user) => [
      user.id,
      computeBalance(subjects.get(user.id)!, byUser.get(user.id) ?? [], year),
    ])
  );
}
