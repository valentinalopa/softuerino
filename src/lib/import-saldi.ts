import "server-only";
import { prisma } from "@/lib/prisma";
import { tallyLeave } from "@/lib/leave-balance";
import { countedLeaveDays, isWorkingDay, slotsClash } from "@/lib/leave-days";
import { leaveTypesFor, LEAVE_TYPES, PARTITA_IVA_ASSENZE_DAYS_PER_YEAR, type LeaveType } from "@/lib/constants";

// Import di saldi e assenze da un file JSON (es. ricostruiti da buste paga e
// calendario): il super admin lo carica da Impostazioni → Importa dati, vede
// prima cosa cambierebbe (anteprima) e poi lo applica. Si può caricare più
// volte: quello che c'è già non si duplica.
// - chiusure: create solo se nessuna chiusura copre già quelle date;
// - richieste: saltate se la persona ne ha già una (non rifiutata) che si
//   sovrappone (le chiusure aziendali non contano);
// - busta paga (dipendenti): sostituisce i saldi di quel mese;
// - residuo assenze (partite IVA): la rettifica dell'anno è calcolata perché
//   al giorno indicato restino esattamente quei giorni, con le richieste che
//   ci sono in quel momento.
// Le persone si riconoscono dall'email (o, se manca, dal nome esatto).

export const IMPORT_FORMAT = "softuerino-import-saldi";

type FileRequest = {
  tipo: string;
  dal: string;
  al?: string;
  ore?: number | null;
  dalle?: string | null;
  alle?: string | null;
  nota?: string | null;
};

type FilePerson = {
  email?: string;
  nome?: string;
  bustaPaga?: {
    mese: string;
    ferieOre: number;
    rolOre: number;
    ferieOreAnno: number;
    rolOreAnno: number;
    oreGiorno?: number;
  };
  residuoAssenze?: { anno: number; giorni: number; alGiorno: string };
  richieste?: FileRequest[];
};

type ImportFile = {
  formato: string;
  versione: number;
  chiusure?: { dal: string; al: string; nota?: string | null }[];
  persone: FilePerson[];
};

type Range = { startDate: Date; endDate: Date; startTime: string | null; endTime: string | null };
type PlannedRequest = Range & {
  userId: string;
  type: LeaveType;
  status: string;
  hours: number | null;
  note: string | null;
};

export type ImportReport = {
  closures: { label: string; action: "crea" | "salta"; reason?: string }[];
  people: {
    name: string;
    found: boolean;
    created: { label: string }[];
    skipped: { label: string; reason: string }[];
    payslip?: string;
    adjustment?: string;
  }[];
  warnings: string[];
};

type Plan = {
  report: ImportReport;
  closures: { startDate: Date; endDate: Date; note: string | null }[];
  requests: PlannedRequest[];
  starts: {
    userId: string;
    month: Date;
    ferieHours: number;
    rolHours: number;
    ferieHoursPerYear: number;
    rolHoursPerYear: number;
    dailyHours: number;
  }[];
  adjustments: { userId: string; year: number; amount: number }[];
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function day(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isRealDay(iso: unknown): iso is string {
  if (typeof iso !== "string" || !ISO_DAY.test(iso)) return false;
  const date = day(iso);
  return date.getFullYear() === Number(iso.slice(0, 4)) && date.getMonth() + 1 === Number(iso.slice(5, 7));
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function formatDay(date: Date) {
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function rangeLabel(type: string, r: { startDate: Date; endDate: Date; hours?: number | null }) {
  const dates =
    r.startDate.getTime() === r.endDate.getTime()
      ? formatDay(r.startDate)
      : `${formatDay(r.startDate)} → ${formatDay(r.endDate)}`;
  return `${type} ${dates}${r.hours ? ` (${r.hours} h)` : ""}`;
}

// Controlla la forma del file: errori bloccanti, prima di leggere il database.
export function parseImportFile(text: string): { data: ImportFile } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "Il file non è un JSON valido" };
  }
  const file = raw as ImportFile;
  if (!file || file.formato !== IMPORT_FORMAT || file.versione !== 1) {
    return { error: "Formato non riconosciuto: serve un file di import saldi di Softuerino (versione 1)" };
  }
  if (!Array.isArray(file.persone)) return { error: "Nel file manca l'elenco delle persone" };
  for (const closure of file.chiusure ?? []) {
    if (!isRealDay(closure.dal) || !isRealDay(closure.al) || closure.al < closure.dal) {
      return { error: `Chiusura con date non valide: ${closure.dal} → ${closure.al}` };
    }
  }
  for (const person of file.persone) {
    const who = person.nome ?? person.email ?? "?";
    if (!person.email && !person.nome) return { error: "Una persona non ha né email né nome" };
    const slip = person.bustaPaga;
    if (slip) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(slip.mese)) return { error: `${who}: mese della busta paga non valido` };
      if (![slip.ferieOre, slip.rolOre, slip.ferieOreAnno, slip.rolOreAnno].every(finite)) {
        return { error: `${who}: ore della busta paga non valide` };
      }
      if (slip.oreGiorno !== undefined && !(finite(slip.oreGiorno) && slip.oreGiorno > 0 && slip.oreGiorno <= 12)) {
        return { error: `${who}: ore al giorno non valide` };
      }
    }
    const rest = person.residuoAssenze;
    if (rest && (!Number.isInteger(rest.anno) || !finite(rest.giorni) || !isRealDay(rest.alGiorno))) {
      return { error: `${who}: residuo assenze non valido` };
    }
    for (const r of person.richieste ?? []) {
      if (!LEAVE_TYPES.includes(r.tipo as LeaveType) || r.tipo === "chiusura") {
        return { error: `${who}: tipo di richiesta non valido (${r.tipo})` };
      }
      if (!isRealDay(r.dal) || (r.al !== undefined && (!isRealDay(r.al) || r.al < r.dal))) {
        return { error: `${who}: date non valide (${r.dal} → ${r.al})` };
      }
      if (r.ore != null && !(finite(r.ore) && r.ore > 0 && r.ore <= 24)) {
        return { error: `${who}: ore non valide il ${r.dal}` };
      }
      if ((r.dalle && !TIME.test(r.dalle)) || (r.alle && !TIME.test(r.alle))) {
        return { error: `${who}: orario non valido il ${r.dal}` };
      }
    }
  }
  return { data: file };
}

// Cosa farebbe l'import sul database di adesso, senza scrivere niente.
export async function planImport(file: ImportFile): Promise<Plan> {
  const report: ImportReport = { closures: [], people: [], warnings: [] };
  const plan: Plan = { report, closures: [], requests: [], starts: [], adjustments: [] };

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, employmentType: true, active: true },
  });
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const byName = new Map(users.map((u) => [u.name.toLowerCase(), u]));
  const activeIds = users.filter((u) => u.active).map((u) => u.id);

  // Richieste esistenti (non rifiutate) di tutti: servono per i doppioni e
  // per calcolare i residui. Le nuove si aggiungono man mano.
  const existing = await prisma.leaveRequest.findMany({
    where: { status: { not: "rejected" } },
    select: {
      userId: true,
      type: true,
      status: true,
      startDate: true,
      endDate: true,
      hours: true,
      startTime: true,
      endTime: true,
    },
  });
  const requestsOf = new Map<string, (Range & { type: string; status: string; hours: number | null; userId: string })[]>();
  const addRequest = (r: Range & { type: string; status: string; hours: number | null; userId: string }) => {
    const list = requestsOf.get(r.userId);
    if (list) list.push(r);
    else requestsOf.set(r.userId, [r]);
  };
  existing.forEach(addRequest);
  // Le chiusure non bloccano: un'assenza che ne tocca una (es. ferie fino al
  // primo giorno di chiusura) si importa, e il giorno in comune si conta una
  // volta sola nei saldi.
  const overlaps = (userId: string, r: Range) =>
    (requestsOf.get(userId) ?? []).some(
      (other) =>
        other.type !== "chiusura" &&
        other.startDate <= r.endDate &&
        other.endDate >= r.startDate &&
        slotsClash(r, other)
    );

  // Chiusure aziendali: una richiesta "chiusura" per ogni membro attivo.
  const closures = await prisma.companyClosure.findMany({ select: { startDate: true, endDate: true } });
  for (const c of file.chiusure ?? []) {
    const startDate = day(c.dal);
    const endDate = day(c.al);
    const label = `Chiusura ${formatDay(startDate)} → ${formatDay(endDate)}`;
    if (closures.some((other) => other.startDate <= endDate && other.endDate >= startDate)) {
      report.closures.push({ label, action: "salta", reason: "c'è già una chiusura in queste date" });
      continue;
    }
    closures.push({ startDate, endDate });
    plan.closures.push({ startDate, endDate, note: c.nota ?? null });
    report.closures.push({ label, action: "crea" });
    for (const userId of activeIds) {
      addRequest({ userId, type: "chiusura", status: "approved", startDate, endDate, hours: null, startTime: null, endTime: null });
    }
  }

  for (const person of file.persone) {
    const user =
      (person.email && byEmail.get(person.email.toLowerCase())) ||
      (person.nome && byName.get(person.nome.toLowerCase())) ||
      null;
    const entry: ImportReport["people"][number] = {
      name: user?.name ?? person.nome ?? person.email ?? "?",
      found: Boolean(user),
      created: [],
      skipped: [],
    };
    report.people.push(entry);
    if (!user) {
      report.warnings.push(`${entry.name}: persona non trovata, saltata`);
      continue;
    }

    for (const r of person.richieste ?? []) {
      const type = r.tipo as LeaveType;
      const hours = r.ore ?? null;
      const startDate = day(r.dal);
      // A ore: sempre un giorno solo.
      const endDate = hours !== null ? startDate : day(r.al ?? r.dal);
      const planned: PlannedRequest = {
        userId: user.id,
        type,
        status: type === "malattia" ? "registrata" : "approved",
        startDate,
        endDate,
        hours,
        startTime: hours !== null ? (r.dalle ?? null) : null,
        endTime: hours !== null ? (r.alle ?? null) : null,
        note: r.nota ?? null,
      };
      const label = rangeLabel(type, planned);
      if (!leaveTypesFor(user.employmentType).includes(type)) {
        entry.skipped.push({ label, reason: "tipo non previsto per il suo contratto" });
      } else if (hours !== null ? !isWorkingDay(startDate) : countedLeaveDays(startDate, endDate) === 0) {
        entry.skipped.push({ label, reason: "solo weekend o festivi" });
      } else if (overlaps(user.id, planned)) {
        entry.skipped.push({ label, reason: "c'è già una richiesta in queste date" });
      } else {
        plan.requests.push(planned);
        addRequest(planned);
        entry.created.push({ label });
      }
    }

    const slip = person.bustaPaga;
    if (slip) {
      if (user.employmentType === "partita_iva") {
        report.warnings.push(`${user.name}: è a partita IVA, busta paga ignorata`);
      } else {
        const [y, m] = slip.mese.split("-").map(Number);
        plan.starts.push({
          userId: user.id,
          month: new Date(y, m - 1, 1),
          ferieHours: slip.ferieOre,
          rolHours: slip.rolOre,
          ferieHoursPerYear: slip.ferieOreAnno,
          rolHoursPerYear: slip.rolOreAnno,
          dailyHours: slip.oreGiorno ?? 4,
        });
        entry.payslip = `Busta ${slip.mese}: ferie ${slip.ferieOre} h, ROL ${slip.rolOre} h (${slip.ferieOreAnno} e ${slip.rolOreAnno} h l'anno)`;
      }
    }

    const rest = person.residuoAssenze;
    if (rest) {
      if (user.employmentType !== "partita_iva") {
        report.warnings.push(`${user.name}: non è a partita IVA, residuo assenze ignorato`);
      } else {
        const until = day(rest.alGiorno);
        const used = tallyLeave(
          requestsOf.get(user.id) ?? [],
          new Date(rest.anno, 0, 1),
          new Date(until.getFullYear(), until.getMonth(), until.getDate(), 23, 59, 59, 999),
          () => "partita_iva"
        ).assenzaDays;
        const amount = Math.round((rest.giorni - PARTITA_IVA_ASSENZE_DAYS_PER_YEAR + used) * 100) / 100;
        plan.adjustments.push({ userId: user.id, year: rest.anno, amount });
        entry.adjustment = `Residuo al ${formatDay(until)}: ${rest.giorni} giorni (usati ${used}, rettifica ${amount > 0 ? "+" : ""}${amount})`;
      }
    }
  }
  return plan;
}

// Applica il piano in un'unica transazione: o tutto o niente.
export async function applyImport(plan: Plan) {
  const activeIds = (await prisma.user.findMany({ where: { active: true }, select: { id: true } })).map((u) => u.id);
  await prisma.$transaction([
    ...plan.closures.map((c) =>
      prisma.companyClosure.create({
        data: {
          startDate: c.startDate,
          endDate: c.endDate,
          note: c.note,
          requests: {
            create: activeIds.map((userId) => ({
              userId,
              type: "chiusura",
              status: "approved",
              startDate: c.startDate,
              endDate: c.endDate,
              note: c.note,
            })),
          },
        },
      })
    ),
    ...plan.requests.map((r) => prisma.leaveRequest.create({ data: r })),
    ...plan.starts.flatMap((s) => [
      prisma.leaveBalanceStart.upsert({
        where: { userId_month: { userId: s.userId, month: s.month } },
        create: {
          userId: s.userId,
          month: s.month,
          ferieHours: s.ferieHours,
          rolHours: s.rolHours,
          ferieHoursPerYear: s.ferieHoursPerYear,
          rolHoursPerYear: s.rolHoursPerYear,
        },
        update: {
          ferieHours: s.ferieHours,
          rolHours: s.rolHours,
          ferieHoursPerYear: s.ferieHoursPerYear,
          rolHoursPerYear: s.rolHoursPerYear,
        },
      }),
      prisma.user.update({ where: { id: s.userId }, data: { dailyHours: s.dailyHours } }),
    ]),
    ...plan.adjustments.map((a) =>
      prisma.leaveBalanceAdjustment.upsert({
        where: { userId_year_kind: { userId: a.userId, year: a.year, kind: "assenze" } },
        create: { userId: a.userId, year: a.year, kind: "assenze", amount: a.amount },
        update: { amount: a.amount, setAt: new Date() },
      })
    ),
  ]);
}
