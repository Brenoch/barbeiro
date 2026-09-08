import assert from "node:assert/strict";
import test from "node:test";
import { buildAppointmentIcs, icsFileName, type CalendarEvent } from "../app/calendar.ts";

const event: CalendarEvent = {
  id: "apt_123",
  date: "2026-09-08",
  time: "14:00",
  durationMinutes: 60,
  serviceName: "Corte + barba",
  barberName: "VT",
  shopName: "Bart do Corte",
  neighborhood: "Campo Grande · RJ",
};

const now = new Date(Date.UTC(2026, 8, 2, 16, 30, 0));

test("monta um calendário válido com início e fim", () => {
  const ics = buildAppointmentIcs(event, now);

  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR$/);
  assert.ok(ics.includes("DTSTART:20260908T140000"));
  assert.ok(ics.includes("DTEND:20260908T150000"));
  assert.ok(ics.includes("DTSTAMP:20260902T163000Z"));
});

test("soma a duração do serviço para achar o fim", () => {
  const ics = buildAppointmentIcs({ ...event, time: "09:30", durationMinutes: 40 }, now);
  assert.ok(ics.includes("DTSTART:20260908T093000"));
  assert.ok(ics.includes("DTEND:20260908T101000"));
});

test("vira o dia quando o atendimento passa da meia-noite", () => {
  const ics = buildAppointmentIcs({ ...event, time: "23:30", durationMinutes: 60 }, now);
  assert.ok(ics.includes("DTSTART:20260908T233000"));
  assert.ok(ics.includes("DTEND:20260909T003000"));
});

test("descreve o serviço e o barbeiro no título", () => {
  const ics = buildAppointmentIcs(event, now);
  assert.ok(ics.includes("SUMMARY:Corte + barba com VT"));
});

test("escapa a vírgula, que o formato usa como separador", () => {
  const ics = buildAppointmentIcs({ ...event, serviceName: "Corte, barba e sobrancelha" }, now);
  assert.ok(ics.includes("SUMMARY:Corte\\, barba e sobrancelha com VT"));
});

test("inclui o lembrete de uma hora antes", () => {
  const ics = buildAppointmentIcs(event, now);
  assert.ok(ics.includes("BEGIN:VALARM"));
  assert.ok(ics.includes("TRIGGER:-PT60M"));
  assert.ok(ics.includes("END:VALARM"));
});

test("nenhuma linha passa de 75 octetos", () => {
  const ics = buildAppointmentIcs(
    { ...event, serviceName: "Corte completo com pigmentação, barba desenhada e hidratação" },
    now,
  );

  for (const line of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `linha longa demais: ${line}`);
  }
});

test("nomeia o arquivo com a data e a hora", () => {
  assert.equal(icsFileName(event), "bart-do-corte-2026-09-08-14h00.ics");
});
