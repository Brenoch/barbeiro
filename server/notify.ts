import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { barbers, notifications, services, shopSettings } from "@/db/schema";
import { randomId } from "./password";
import { readWhatsAppConfig, sendTemplate, type TemplateName } from "./whatsapp";

type AppointmentLike = {
  id: string;
  client: string;
  phone: string;
  serviceId: string;
  barberId: string;
  date: string;
  time: string;
};

/** "2026-09-08" vira "08/09". O ano só polui o aviso. */
function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return month && day ? `${day}/${month}` : value;
}

/** "(21) 99999-9999" a partir dos dígitos guardados. */
function displayPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "não informado";
}

/**
 * Monta e envia o aviso de um agendamento.
 *
 * Nunca lança: qualquer falha vira uma linha na tabela `notifications`. Quem
 * chama dispara sem `await` bloqueante e segue — o agendamento já está salvo.
 */
export async function notifyAppointment(appointment: AppointmentLike, kind: "created" | "cancelled") {
  const config = readWhatsAppConfig(env as unknown as Record<string, string | undefined>);
  if (!config) return;

  const db = getDb();

  const [settings] = await db.select().from(shopSettings).where(eq(shopSettings.id, "shop")).limit(1);
  const [barber] = await db.select().from(barbers).where(eq(barbers.id, appointment.barberId)).limit(1);
  const [service] = await db.select().from(services).where(eq(services.id, appointment.serviceId)).limit(1);

  // O barbeiro do horário recebe sempre; o dono só se tiver pedido.
  const recipients = new Set<string>();
  if (barber?.notifyPhone) recipients.add(barber.notifyPhone);
  if (settings?.notifyOwnerAll && settings.ownerPhone) recipients.add(settings.ownerPhone);

  if (recipients.size === 0) return;

  const template: TemplateName = kind === "created" ? "novo_agendamento" : "agendamento_cancelado";

  const parameters =
    kind === "created"
      ? [
          appointment.client,
          service?.name ?? "Serviço",
          `${shortDate(appointment.date)} às ${appointment.time}`,
          barber?.name ?? "Equipe",
          displayPhone(appointment.phone),
        ]
      : [
          appointment.client,
          service?.name ?? "Serviço",
          `${shortDate(appointment.date)} às ${appointment.time}`,
          barber?.name ?? "Equipe",
        ];

  for (const to of recipients) {
    const result = await sendTemplate(config, to, template, parameters);

    await db.insert(notifications).values({
      id: randomId("ntf"),
      appointmentId: appointment.id,
      kind,
      toPhone: to,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? "" : result.error,
    });
  }
}

/**
 * Envia o aviso sem nunca deixar o erro subir.
 *
 * Precisa ser aguardado: no runtime dos Workers, uma promessa solta é
 * cancelada assim que a resposta é devolvida — o envio e o registro morreriam
 * junto com a requisição. O `sendTemplate` tem timeout próprio, então o pior
 * caso é o agendamento demorar alguns segundos a mais, nunca falhar.
 */
export async function notifySafely(appointment: AppointmentLike, kind: "created" | "cancelled") {
  try {
    await notifyAppointment(appointment, kind);
  } catch {
    // Aviso é acessório: o agendamento já está salvo e vale mais.
  }
}
