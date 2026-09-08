/**
 * Envio de avisos pelo WhatsApp Cloud API da Meta.
 *
 * As credenciais ficam em variáveis de ambiente do Worker, nunca no banco e
 * nunca no código:
 *
 *   npx wrangler secret put WHATSAPP_TOKEN
 *   npx wrangler secret put WHATSAPP_PHONE_ID
 *
 * Sem elas configuradas o módulo inteiro vira no-op: o sistema continua
 * funcionando normalmente, só não manda aviso nenhum.
 */

/** Versão da Graph API. A Meta troca com frequência — dá para sobrescrever. */
const DEFAULT_API_VERSION = "v21.0";

/** Teto de espera pela Meta. O agendamento não pode ficar preso num timeout. */
const REQUEST_TIMEOUT_MS = 5000;

export type WhatsAppConfig = {
  token: string;
  phoneId: string;
  apiVersion: string;
};

type WorkerEnv = Record<string, string | undefined>;

export function readWhatsAppConfig(env: WorkerEnv): WhatsAppConfig | null {
  const token = env.WHATSAPP_TOKEN?.trim();
  const phoneId = env.WHATSAPP_PHONE_ID?.trim();

  if (!token || !phoneId) return null;

  return {
    token,
    phoneId,
    apiVersion: env.WHATSAPP_API_VERSION?.trim() || DEFAULT_API_VERSION,
  };
}

/**
 * Deixa o telefone no formato que a Meta espera: 55 + DDD + número.
 *
 * Aceita o que o brasileiro digita de verdade — "(21) 99999-9999",
 * "21 99999 9999", "+55 21 99999-9999" — e devolve `null` quando não dá para
 * confiar, em vez de mandar um número torto para a Meta.
 */
export function toWhatsAppNumber(value: string): string | null {
  let digits = value.replace(/\D/g, "");

  // Zero de operadora ou DDD com zero na frente: "021 99999..."
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");

  // Já veio com o código do país.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // DDD + celular de 9 dígitos, ou DDD + fixo de 8.
  if (digits.length === 11 || digits.length === 10) {
    return `55${digits}`;
  }

  return null;
}

export type TemplateName = "novo_agendamento" | "agendamento_cancelado";

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Dispara um modelo aprovado. Erro nunca é lançado: quem chama registra o
 * resultado e segue a vida, porque falha de aviso não pode derrubar um
 * agendamento que já foi gravado.
 */
export async function sendTemplate(
  config: WhatsAppConfig,
  to: string,
  template: TemplateName,
  parameters: string[],
): Promise<SendResult> {
  const number = toWhatsAppNumber(to);
  if (!number) return { ok: false, error: `Telefone inválido: ${to}` };

  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: number,
    type: "template",
    template: {
      name: template,
      language: { code: "pt_BR" },
      components: [
        {
          type: "body",
          // A Meta rejeita quebra de linha e espaço duplo dentro da variável.
          parameters: parameters.map(text => ({
            type: "text",
            text: text.replace(/\s+/g, " ").trim() || "-",
          })),
        },
      ],
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.ok) return { ok: true };

    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string; code?: number } }
      | null;

    const message = body?.error?.message ?? `HTTP ${response.status}`;
    return { ok: false, error: message.slice(0, 300) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : "Falha de rede" };
  }
}
