import { prisma } from "@/lib/prisma";
import {
  LEAVE_ALLOWANCE_BY_EMPLOYMENT_TYPE,
  type EmploymentType,
} from "@/lib/constants";

export function daysBetweenInclusive(startDate: Date, endDate: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = Date.UTC(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  );
  const end = Date.UTC(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate()
  );
  return Math.round((end - start) / msPerDay) + 1;
}

// Giorni conteggiati ai fini dei monti ferie/malattia/assenze: si lavora
// lun-ven, quindi sabati e domeniche non vengono scalati. I festivi non sono
// gestiti (servirebbe un calendario festività).
export function countedLeaveDays(startDate: Date, endDate: Date) {
  let count = 0;
  const d = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  );
  const end = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate()
  );
  while (d <= end) {
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Conta solo i giorni della richiesta che ricadono dentro [rangeStart, rangeEnd]:
// una richiesta a cavallo di due anni (es. 28/12 -> 05/01) va spalmata sui due
// anni invece di essere interamente contata su uno solo.
export function clippedDaysInRange(
  startDate: Date,
  endDate: Date,
  rangeStart: Date,
  rangeEnd: Date
) {
  const clippedStart = startDate < rangeStart ? rangeStart : startDate;
  const clippedEnd = endDate > rangeEnd ? rangeEnd : endDate;
  if (clippedEnd < clippedStart) return 0;
  return countedLeaveDays(clippedStart, clippedEnd);
}

export type LeaveTally = {
  ferieUsed: number;
  permessoUsed: number;
  malattiaDays: number;
  assenzaDays: number;
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

  for (const request of requests) {
    if (request.type === "ferie" && request.status === "approved") {
      ferieUsed += clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd);
    } else if (request.type === "permesso" && request.status === "approved") {
      permessoUsed += request.hours ?? 0;
    } else if (request.type === "malattia" && request.status === "registrata") {
      malattiaDays += clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd);
    } else if (request.type === "assenza" && request.status === "approved") {
      assenzaDays += clippedDaysInRange(request.startDate, request.endDate, yearStart, yearEnd);
    }
  }

  return { ferieUsed, permessoUsed, malattiaDays, assenzaDays };
}

// Dipendenti: ferie (giorni) + permessi (ore) + malattia senza tetto.
// Partite IVA: un unico monte "assenze" in giorni.
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

function balanceFromTally(
  employmentType: EmploymentType,
  tally: LeaveTally
): LeaveBalance {
  if (employmentType === "partita_iva") {
    const allowance = LEAVE_ALLOWANCE_BY_EMPLOYMENT_TYPE.partita_iva;
    return {
      kind: "assenze",
      assenzeAllowance: allowance.assenzeDaysPerYear,
      assenzeUsed: tally.assenzaDays,
      assenzeRemaining: allowance.assenzeDaysPerYear - tally.assenzaDays,
    };
  }
  const allowance = LEAVE_ALLOWANCE_BY_EMPLOYMENT_TYPE.dipendente;
  return {
    kind: "dipendente",
    ferieAllowance: allowance.ferieDaysPerYear,
    ferieUsed: tally.ferieUsed,
    ferieRemaining: allowance.ferieDaysPerYear - tally.ferieUsed,
    permessoAllowance: allowance.permessoHoursPerYear,
    permessoUsed: tally.permessoUsed,
    permessoRemaining: allowance.permessoHoursPerYear - tally.permessoUsed,
    malattiaDaysRegistered: tally.malattiaDays,
  };
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
  const { yearStart, yearEnd } = yearRange(year);

  const requests = await prisma.leaveRequest.findMany({
    where: {
      userId,
      startDate: { lte: yearEnd },
      endDate: { gte: yearStart },
    },
  });

  return balanceFromTally(employmentType, tallyLeave(requests, yearStart, yearEnd));
}

// Versione batch: una sola query per tutti gli utenti invece di una a testa
// (la pagina Team la usa per evitare l'N+1 sui membri).
export async function getLeaveBalancesForUsers(
  users: { id: string; employmentType: EmploymentType }[],
  year: number = new Date().getFullYear()
): Promise<Map<string, LeaveBalance>> {
  const { yearStart, yearEnd } = yearRange(year);

  const requests = await prisma.leaveRequest.findMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      startDate: { lte: yearEnd },
      endDate: { gte: yearStart },
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
      balanceFromTally(
        user.employmentType,
        tallyLeave(byUser.get(user.id) ?? [], yearStart, yearEnd)
      ),
    ])
  );
}
