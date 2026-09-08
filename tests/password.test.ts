import assert from "node:assert/strict";
import test from "node:test";
import {
  generateTemporaryPassword,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../server/password.ts";

test("nunca guarda a senha em texto", async () => {
  const stored = await hashPassword("cortededois8");

  assert.ok(!stored.includes("cortededois8"));
  assert.match(stored, /^pbkdf2\$210000\$[^$]+\$[^$]+$/);
});

test("aceita a senha correta e recusa a errada", async () => {
  const stored = await hashPassword("cortededois8");

  assert.equal(await verifyPassword("cortededois8", stored), true);
  assert.equal(await verifyPassword("cortededois9", stored), false);
  assert.equal(await verifyPassword("", stored), false);
});

test("usa um salt diferente a cada hash", async () => {
  const first = await hashPassword("mesmasenha123");
  const second = await hashPassword("mesmasenha123");

  assert.notEqual(first, second);
  assert.equal(await verifyPassword("mesmasenha123", first), true);
  assert.equal(await verifyPassword("mesmasenha123", second), true);
});

test("recusa um hash malformado sem lançar erro", async () => {
  assert.equal(await verifyPassword("qualquer", "1234"), false);
  assert.equal(await verifyPassword("qualquer", "bcrypt$1$a$b"), false);
  assert.equal(await verifyPassword("qualquer", ""), false);
});

test("o token de sessão vira hash estável e não reversível", async () => {
  const token = "abc123";
  const hash = await hashToken(token);

  assert.equal(hash, await hashToken(token));
  assert.notEqual(hash, await hashToken("abc124"));
  assert.ok(!hash.includes(token));
});

test("a senha provisória evita caracteres ambíguos", () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const password = generateTemporaryPassword();
    assert.equal(password.length, 8);
    // Sem O/0, I/1: o proprietário dita a senha por telefone.
    assert.match(password, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  }
});
