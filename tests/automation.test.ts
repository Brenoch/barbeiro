import assert from "node:assert/strict";
import test from "node:test";
import { shouldFinalize } from "../server/automation-rules.ts";

const base = { date: "2026-08-27", time: "15:00", status: "confirmed" };

test("segura o atendimento enquanto o horário não chegou", () => {
  assert.equal(shouldFinalize(base, new Date("2026-08-27T14:59:59")), false);
});

test("conclui assim que o horário chega", () => {
  assert.equal(shouldFinalize(base, new Date("2026-08-27T15:00:00")), true);
  assert.equal(shouldFinalize(base, new Date("2026-08-27T18:00:00")), true);
});

test("não mexe em quem já foi cancelado ou concluído", () => {
  const depois = new Date("2026-08-27T16:00:00");

  assert.equal(shouldFinalize({ ...base, status: "cancelled" }, depois), false);
  assert.equal(shouldFinalize({ ...base, status: "completed" }, depois), false);
  assert.equal(shouldFinalize({ ...base, status: "noshow" }, depois), false);
});

test("data ou hora corrompida não dá baixa por engano", () => {
  const depois = new Date("2026-08-27T16:00:00");

  assert.equal(shouldFinalize({ ...base, date: "" }, depois), false);
  assert.equal(shouldFinalize({ ...base, time: "sem-hora" }, depois), false);
});
