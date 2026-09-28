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
