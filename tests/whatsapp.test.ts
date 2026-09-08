import assert from "node:assert/strict";
import test from "node:test";
import { readWhatsAppConfig, toWhatsAppNumber } from "../server/whatsapp.ts";

test("aceita o telefone como o brasileiro digita", () => {
  const esperado = "5521999998888";

  assert.equal(toWhatsAppNumber("(21) 99999-8888"), esperado);
  assert.equal(toWhatsAppNumber("21999998888"), esperado);
  assert.equal(toWhatsAppNumber("21 99999 8888"), esperado);
  assert.equal(toWhatsAppNumber("+55 21 99999-8888"), esperado);
  assert.equal(toWhatsAppNumber("55 (21) 99999-8888"), esperado);
});

test("remove o zero da operadora e do DDD", () => {
  assert.equal(toWhatsAppNumber("021 99999-8888"), "5521999998888");
  assert.equal(toWhatsAppNumber("0 21 99999 8888"), "5521999998888");
});

test("aceita telefone fixo de 8 dígitos", () => {
  assert.equal(toWhatsAppNumber("(21) 2555-8888"), "552125558888");
});

test("recusa o que não dá para confiar em vez de mandar torto", () => {
  assert.equal(toWhatsAppNumber(""), null);
  assert.equal(toWhatsAppNumber("99999-8888"), null); // sem DDD
  assert.equal(toWhatsAppNumber("123"), null);
  assert.equal(toWhatsAppNumber("5521999998888000"), null); // dígitos demais
  assert.equal(toWhatsAppNumber("não informado"), null);
});

test("sem credencial, o envio fica desligado", () => {
  assert.equal(readWhatsAppConfig({}), null);
  assert.equal(readWhatsAppConfig({ WHATSAPP_TOKEN: "abc" }), null);
  assert.equal(readWhatsAppConfig({ WHATSAPP_PHONE_ID: "123" }), null);
  assert.equal(readWhatsAppConfig({ WHATSAPP_TOKEN: "   ", WHATSAPP_PHONE_ID: "123" }), null);
});

test("com credencial, usa a versão padrão da API ou a informada", () => {
  const padrao = readWhatsAppConfig({ WHATSAPP_TOKEN: "abc", WHATSAPP_PHONE_ID: "123" });
  assert.equal(padrao?.token, "abc");
  assert.equal(padrao?.phoneId, "123");
  assert.match(padrao?.apiVersion ?? "", /^v\d+\.\d+$/);

  const escolhida = readWhatsAppConfig({
    WHATSAPP_TOKEN: "abc",
    WHATSAPP_PHONE_ID: "123",
    WHATSAPP_API_VERSION: "v23.0",
  });
  assert.equal(escolhida?.apiVersion, "v23.0");
});
