import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appointments } from "@/db/schema";
import { shouldFinalize } from "./automation-rules";

/**
 * Conclui e marca como pago todo atendimento cujo horário já passou.
 * Roda no servidor, então vale para todos os aparelhos ao mesmo tempo.
 */
export async function finalizeStartedAppointments(now = new Date()) {
  const db = getDb();
  const pending = await db.select().from(appointments).where(eq(appointments.status, "confirmed"));

  for (const item of pending) {
    if (!shouldFinalize(item, now)) continue;

    await db
      .update(appointments)
      .set({
        status: "completed",
        paid: true,
        paymentMethod: item.paymentMethod ?? "Pix",
        autoCompletedAt: now.toISOString(),
      })
      .where(eq(appointments.id, item.id));
  }
}
