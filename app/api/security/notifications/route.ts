import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments, barbers, notifications } from "@/db/schema";
import { requireRole } from "@/server/session";

/**
 * Últimos avisos de WhatsApp, com sucesso ou falha.
 *
 * Sem essa rota, "mandou ou não mandou?" só tinha resposta olhando o banco
 * direto — o proprietário não tinha como saber pelo próprio app.
 */
export async function GET(request: Request) {
  const { session, response } = await requireRole(request, ["admin"]);
  if (!session) return response;

  const db = getDb();
  const rows = await db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(30);

  const appointmentIds = [...new Set(rows.map(row => row.appointmentId))];
  const relatedAppointments = appointmentIds.length
    ? await Promise.all(appointmentIds.map(id => db.select().from(appointments).where(eq(appointments.id, id)).limit(1)))
    : [];
  const appointmentById = new Map(relatedAppointments.flat().map(item => [item.id, item]));

  const barberRows = await db.select().from(barbers);
  const barberById = new Map(barberRows.map(item => [item.id, item.name]));

  const items = rows.map(row => {
    const appointment = appointmentById.get(row.appointmentId);
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      error: row.error,
      toPhone: row.toPhone,
      createdAt: row.createdAt,
      client: appointment?.client ?? "",
      barberName: appointment ? (barberById.get(appointment.barberId) ?? "") : "",
    };
  });

  return Response.json({
    notifications: items,
    failedCount: items.filter(item => item.status === "failed").length,
  });
}
