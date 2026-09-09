import assert from "node:assert/strict";
import test from "node:test";
import { calculateRevenue } from "../app/revenue.ts";

test("calculates daily and monthly revenue from completed appointments", () => {
  const revenue = calculateRevenue([
    { price: 35, date: "2026-08-27", status: "completed" },
    { price: 55, date: "2026-08-26", status: "completed" },
    { price: 35, date: "2026-07-30", status: "completed" },
  ], "2026-08-27");

  assert.deepEqual(revenue, { today: 35, month: 90, total: 125 });
});

test("excludes cancelled and confirmed appointments", () => {
  const revenue = calculateRevenue([
    { price: 35, date: "2026-08-27", status: "cancelled" },
    { price: 55, date: "2026-08-27", status: "confirmed" },
  ], "2026-08-27");

  assert.deepEqual(revenue, { today: 0, month: 0, total: 0 });
});

test("um reajuste de preço hoje não muda o faturamento já registrado", () => {
  // O preço vem congelado no agendamento — nada aqui olha o catálogo atual.
  const revenue = calculateRevenue([
    { price: 35, date: "2026-08-01", status: "completed" },
  ], "2026-09-01");

  assert.equal(revenue.total, 35);
});
