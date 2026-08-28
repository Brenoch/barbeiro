import assert from "node:assert/strict";
import test from "node:test";
import { calculateRevenue } from "../app/revenue.ts";

const services = new Map([
  ["cut", { price: 35 }],
  ["combo", { price: 55 }],
]);

test("calculates daily and monthly revenue from completed appointments", () => {
  const revenue = calculateRevenue([
    { serviceId: "cut", date: "2026-08-27", status: "completed" },
    { serviceId: "combo", date: "2026-08-26", status: "completed" },
    { serviceId: "cut", date: "2026-07-30", status: "completed" },
  ], services, "2026-08-27");

  assert.deepEqual(revenue, { today: 35, month: 90, total: 125 });
});

test("excludes cancelled and confirmed appointments", () => {
  const revenue = calculateRevenue([
    { serviceId: "cut", date: "2026-08-27", status: "cancelled" },
    { serviceId: "combo", date: "2026-08-27", status: "confirmed" },
  ], services, "2026-08-27");

  assert.deepEqual(revenue, { today: 0, month: 0, total: 0 });
});
