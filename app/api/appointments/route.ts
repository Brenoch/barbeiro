import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, barbers, services } from "@/db/schema";
import { randomId } from "@/server/password";
import { getSession, unauthorized } from "@/server/session";
import { notifySafely } from "@/server/notify";
import { checkSlot, dateISO, minutes } from "@/server/store";

/** Só o cliente inicia agendamento por aqui. Balcão é entrega futura. */
export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) return unauthorized("Entre para agendar.");
  if (session.role !== "client" || !session.clientId) {
    return Response.json({ error: "Somente o cliente pode marcar horário." }, { status: 403 });
  }

  const db = getDb();
  const payload = (await request.json()) as {
    serviceId?: string;
    barberId?: string;
    date?: string;
    time?: string;
  };

  const { serviceId = "", barberId = "", date = "", time = "" } = payload;
  if (!serviceId || !barberId || !date || !time) {
    return Response.json({ error: "Dados do agendamento incompletos." }, { status: 400 });
  }

  const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!service || !service.active) {
    return Response.json({ error: "Serviço indisponível." }, { status: 400 });
  }

  const [barber] = await db.select().from(barbers).where(eq(barbers.id, barberId)).limit(1);
  if (!barber || !barber.active) {
    return Response.json({ error: "Barbeiro indisponível." }, { status: 400 });
  }

  // Nunca no passado: nem data anterior a hoje, nem horário já passado hoje.
  const today = dateISO();
  const pastDate = date < today;
  const pastTimeToday = date === today && minutes(time) < minutes(currentTime());
  if (pastDate || pastTimeToday) {
    return Response.json({ error: "Não é possível agendar num horário que já passou." }, { status: 400 });
  }

  // Revalida no servidor: a tela pode estar desatualizada e dois clientes
  // podem tocar no mesmo horário ao mesmo tempo.
  const slot = await checkSlot(barberId, date, time, service.duration);
  if (!slot.free) {
    return Response.json({ error: slot.reason }, { status: 409 });
  }

  const [created] = await db
    .insert(appointments)
    .values({
      id: randomId("apt"),
      clientId: session.clientId,
      client: session.displayName,
      phone: "",
      serviceId,
      // Preço, nome e duração congelados agora: um reajuste depois não pode
      // mudar quanto esse agendamento valeu nem quanto tempo ele reservou.
      serviceName: service.name,
      price: service.price,
      duration: service.duration,
      barberId,
      date,
      time,
      status: "confirmed",
      paid: false,
    })
    .returning();

  await notifySafely(created, "created");

  return Response.json({ appointment: created }, { status: 201 });
}

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** O que cada papel pode transicionar. Impede pular etapa ou desfazer o que já aconteceu. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  confirmed: ["completed", "cancelled"],
};

export async function PATCH(request: Request) {
  const session = await getSession(request);
  if (!session) return unauthorized();

  const db = getDb();
  const payload = (await request.json()) as {
    id?: string;
    status?: "confirmed" | "completed" | "cancelled" | "noshow";
    paid?: boolean;
    paymentMethod?: "Pix" | "Dinheiro" | "Débito" | "Crédito";
  };

  if (!payload.id || !payload.status) {
    return Response.json({ error: "Informe o agendamento e o novo status." }, { status: 400 });
  }

  const [item] = await db.select().from(appointments).where(eq(appointments.id, payload.id)).limit(1);
  if (!item) return Response.json({ error: "Agendamento não encontrado." }, { status: 404 });

  if (session.role === "client") {
    if (item.clientId !== session.clientId) return unauthorized();
    if (payload.status !== "cancelled") {
      return Response.json({ error: "O cliente só pode cancelar." }, { status: 403 });
    }
  }

  if (session.role === "barber" && item.barberId !== session.barberId) {
    return Response.json({ error: "Este atendimento é de outro barbeiro." }, { status: 403 });
  }

  // Sem isso, dava para cancelar (ou "concluir" de novo) um atendimento que já
  // tinha acabado, distorcendo o caixa depois de fechado.
  const allowed = ALLOWED_TRANSITIONS[item.status] ?? [];
  if (item.status !== payload.status && !allowed.includes(payload.status)) {
    return Response.json(
      { error: `Este agendamento já está "${item.status}" e não pode virar "${payload.status}".` },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(appointments)
    .set({
      status: payload.status,
      paid: payload.paid ?? item.paid,
      paymentMethod: payload.paid ? payload.paymentMethod ?? item.paymentMethod ?? "Pix" : item.paymentMethod,
    })
    .where(eq(appointments.id, payload.id))
    .returning();

  // Só avisa quando o horário realmente abriu, não a cada mudança de status.
  if (payload.status === "cancelled" && item.status !== "cancelled") {
    await notifySafely(updated, "cancelled");
  }

  return Response.json({ appointment: updated });
}

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session || session.role === "client") return unauthorized();

  const db = getDb();
  if (session.role === "barber") {
    return Response.json({
      appointments: await db
        .select()
        .from(appointments)
        .where(and(eq(appointments.barberId, session.barberId ?? ""))),
    });
  }

  return Response.json({ appointments: await db.select().from(appointments) });
}
