import assert from "node:assert/strict";
import test from "node:test";
import { finalizeStartedAppointments, type AutoCompletableAppointment } from "../app/appointment-automation.ts";

const base: AutoCompletableAppointment = {
  date: "2026-08-27",
  time: "15:00",
  status: "confirmed",
  paid: false,
};

test("keeps an appointment pending before its scheduled time", () => {
  const appointments = [base];
  const result = finalizeStartedAppointments(appointments, new Date("2026-08-27T14:59:59"));

  assert.equal(result, appointments);
  assert.equal(result[0].status, "confirmed");
  assert.equal(result[0].paid, false);
});

test("completes and marks an appointment as paid when its time arrives", () => {
  const now = new Date("2026-08-27T15:00:00");
  const result = finalizeStartedAppointments([base], now);

  assert.equal(result[0].status, "completed");
  assert.equal(result[0].paid, true);
  assert.equal(result[0].paymentMethod, "Pix");
  assert.equal(result[0].autoCompletedAt, now.toISOString());
});

test("does not change cancelled appointments", () => {
  const cancelled = { ...base, status: "cancelled" as const };
  const result = finalizeStartedAppointments([cancelled], new Date("2026-08-27T16:00:00"));

  assert.equal(result[0], cancelled);
  assert.equal(result[0].paid, false);
});
