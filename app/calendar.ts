/**
 * Gera o arquivo .ics do agendamento, que o celular abre direto no app de
 * calendário — iPhone e Android reconhecem o formato nativamente.
 */

export type CalendarEvent = {
  id: string;
  /** "2026-09-08" */
  date: string;
  /** "14:00" */
  time: string;
  durationMinutes: number;
  serviceName: string;
  barberName: string;
  shopName: string;
  neighborhood: string;
};

/** Escapa os caracteres que o formato usa como separador. */
function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * O formato exige linhas de no máximo 75 octetos, dobradas com um espaço.
 * O limite é em bytes, não em caracteres: "pigmentação" ocupa mais espaço do
 * que o número de letras sugere, e um acento não pode ser partido ao meio.
 */
function foldLine(line: string) {
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  // A partir da segunda linha, o espaço de continuação já consome um octeto.
  let limit = 75;

  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > limit) {
      parts.push(parts.length === 0 ? current : ` ${current}`);
      current = "";
      bytes = 0;
      limit = 74;
    }
    current += character;
    bytes += size;
  }

  if (current) parts.push(parts.length === 0 ? current : ` ${current}`);
  return parts.join("\r\n");
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Data e hora sem fuso: o celular interpreta no horário local, que é o da barbearia. */
function localStamp(date: string, minutesFromMidnight: number) {
  const [year, month, day] = date.split("-").map(Number);
  const at = new Date(year, month - 1, day, 0, minutesFromMidnight, 0);
  return `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}T${pad(at.getHours())}${pad(at.getMinutes())}00`;
}

function utcStamp(now: Date) {
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

export function buildAppointmentIcs(event: CalendarEvent, now = new Date()) {
  const [hour, minute] = event.time.split(":").map(Number);
  const startMinutes = hour * 60 + minute;
  const title = `${event.serviceName} com ${event.barberName}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bart do Corte//Agendamento//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@bartdocorte`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${localStamp(event.date, startMinutes)}`,
    `DTEND:${localStamp(event.date, startMinutes + event.durationMinutes)}`,
    `SUMMARY:${escapeText(title)}`,
    `LOCATION:${escapeText(`${event.shopName} · ${event.neighborhood}`)}`,
    `DESCRIPTION:${escapeText(`Seu horário na ${event.shopName}. Serviço: ${event.serviceName}. Barbeiro: ${event.barberName}.`)}`,
    "STATUS:CONFIRMED",
    // Lembrete uma hora antes, direto no celular do cliente.
    "BEGIN:VALARM",
    "TRIGGER:-PT60M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(`Seu horário na ${event.shopName} é daqui a 1 hora`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join("\r\n");
}

export function icsFileName(event: CalendarEvent) {
  return `bart-do-corte-${event.date}-${event.time.replace(":", "h")}.ics`;
}

/**
 * Entrega o arquivo ao celular. O iOS abre no Calendário a partir do blob; o
 * atributo `download` cobre Android e desktop.
 */
export function saveToCalendar(event: CalendarEvent) {
  const blob = new Blob([buildAppointmentIcs(event)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = icsFileName(event);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
