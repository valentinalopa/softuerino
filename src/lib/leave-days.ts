// Conteggio dei giorni di assenza: funzioni pure, senza database, così le
// usano sia il server (saldi) sia i componenti client (durata in tabella).

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

// Feste comandate a data fissa ("mese-giorno"), compreso il patrono della
// sede (San Giovanni, Torino, 24 giugno).
const FIXED_HOLIDAYS = new Set([
  "1-1", // Capodanno
  "1-6", // Epifania
  "4-25", // Liberazione
  "5-1", // Festa dei lavoratori
  "6-2", // Festa della Repubblica
  "6-24", // San Giovanni, patrono di Torino
  "8-15", // Ferragosto
  "11-1", // Ognissanti
  "12-8", // Immacolata
  "12-25", // Natale
  "12-26", // Santo Stefano
]);

// Domenica di Pasqua (calendario gregoriano, algoritmo di Meeus/Jones/Butcher).
function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Festa comandata: le feste fisse più Pasquetta (la Pasqua cade di domenica,
// già esclusa come ogni weekend).
export function isHoliday(date: Date) {
  if (FIXED_HOLIDAYS.has(`${date.getMonth() + 1}-${date.getDate()}`)) return true;
  const easter = easterSunday(date.getFullYear());
  const easterMonday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 1);
  return (
    date.getMonth() === easterMonday.getMonth() && date.getDate() === easterMonday.getDate()
  );
}

// Giorno lavorativo: si lavora lun-ven, festività escluse.
export function isWorkingDay(date: Date) {
  return date.getDay() !== 0 && date.getDay() !== 6 && !isHoliday(date);
}

// Giorni lavorativi del periodo (inclusi gli estremi), come chiavi
// "yyyy-mm-dd": servono per non contare due volte un giorno coperto da più
// richieste (es. ferie dentro una chiusura aziendale).
export function workingDayKeys(startDate: Date, endDate: Date) {
  const keys: string[] = [];
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
    if (isWorkingDay(d)) {
      keys.push(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return keys;
}

// Giorni conteggiati ai fini dei monti ferie/malattia/assenze: sabati,
// domeniche e feste comandate non vengono scalati.
export function countedLeaveDays(startDate: Date, endDate: Date) {
  return workingDayKeys(startDate, endDate).length;
}

// Restringe il periodo della richiesta a [rangeStart, rangeEnd], o null se
// non si toccano: una richiesta a cavallo di due anni (es. 28/12 -> 05/01) va
// spalmata sui due anni invece di essere interamente contata su uno solo.
function clipRange(startDate: Date, endDate: Date, rangeStart: Date, rangeEnd: Date) {
  const clippedStart = startDate < rangeStart ? rangeStart : startDate;
  const clippedEnd = endDate > rangeEnd ? rangeEnd : endDate;
  return clippedEnd < clippedStart ? null : { start: clippedStart, end: clippedEnd };
}

// Conta solo i giorni della richiesta che ricadono dentro [rangeStart, rangeEnd].
export function clippedDaysInRange(
  startDate: Date,
  endDate: Date,
  rangeStart: Date,
  rangeEnd: Date
) {
  const clipped = clipRange(startDate, endDate, rangeStart, rangeEnd);
  return clipped ? countedLeaveDays(clipped.start, clipped.end) : 0;
}

// Come clippedDaysInRange, ma restituisce le chiavi dei giorni.
export function clippedDayKeysInRange(
  startDate: Date,
  endDate: Date,
  rangeStart: Date,
  rangeEnd: Date
) {
  const clipped = clipRange(startDate, endDate, rangeStart, rangeEnd);
  return clipped ? workingDayKeys(clipped.start, clipped.end) : [];
}
