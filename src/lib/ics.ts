// File iCalendar (.ics, RFC 5545) di un evento: si apre con Calendario di
// iPhone/Mac, Outlook, Google Calendar...

type IcsEvent = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  location: string | null;
  description: string | null;
  url?: string;
};

// Data e ora in UTC: 20261009T080000Z
export function icsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Righe al massimo di 75 byte: le successive iniziano con uno spazio.
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    if (new TextEncoder().encode(current + char).length > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
    }
    current += char;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function eventToIcs(event: IcsEvent, now = new Date()) {
  const description = [event.description, event.url].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Softuerino//Calendario//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@softuerino`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(event.startAt)}`,
    `DTEND:${icsDate(event.endAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

// Link "aggiungi a Google Calendar" con i dati dell'evento già compilati.
export function googleCalendarUrl(event: IcsEvent) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${icsDate(event.startAt)}/${icsDate(event.endAt)}`,
  });
  if (event.location) params.set("location", event.location);
  if (event.description) params.set("details", event.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
