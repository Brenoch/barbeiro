import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { blocks } from "@/db/schema";
import { randomId } from "@/server/password";
import { requireRole } from "@/server/session";
import { BLOCK_SLOT_MINUTES, minutes, timeLabel } from "@/server/store";

/**
 * Bloqueia uma faixa de horário: "não estou na barbearia das 14h às 16h".
 *
 * A faixa é guardada como uma linha por intervalo de 30 minutos, que é a
 * mesma grade usada no agendamento. Assim o horário bloqueado simplesmente
 * some para o cliente, sem precisar de outra regra na hora de marcar.
 */
export async function POST(request: Request) {
  const { session, response } = await requireRole(request, ["barber", "admin"]);
  if (!session) return response;

  const payload = (await request.json()) as {
    barberId?: string;
    date?: string;
    start?: string;
    end?: string;
  };

  const barberId = session.role === "barber" ? session.barberId ?? "" : payload.barberId ?? "";
  const { date = "", start = "", end = "" } = payload;

  if (!barberId || !date || !start || !end) {
    return Response.json({ error: "Informe a data e o horário de início e fim." }, { status: 400 });
  }

  const from = minutes(start);
  const to = minutes(end);

  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return Response.json({ error: "Horário inválido." }, { status: 400 });
  }
  if (to <= from) {
    return Response.json({ error: "O fim precisa ser depois do início." }, { status: 400 });
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.barberId, barberId), eq(blocks.date, date)));

  const alreadyBlocked = new Set(existing.map(row => row.time));
  const created: string[] = [];

  for (let slot = from; slot < to; slot += BLOCK_SLOT_MINUTES) {
    const time = timeLabel(slot);
    if (alreadyBlocked.has(time)) continue;

    await db.insert(blocks).values({ id: randomId("blk"), barberId, date, time });
    created.push(time);
  }

  return Response.json({ blocked: created.length, from: start, to: end });
}

/** Libera a faixa inteira que contém o horário informado. */
export async function DELETE(request: Request) {
  const { session, response } = await requireRole(request, ["barber", "admin"]);
  if (!session) return response;

  const payload = (await request.json()) as {
    barberId?: string;
    date?: string;
    start?: string;
    end?: string;
  };

  const barberId = session.role === "barber" ? session.barberId ?? "" : payload.barberId ?? "";
  const { date = "", start = "", end = "" } = payload;

  if (!barberId || !date || !start || !end) {
    return Response.json({ error: "Informe a data e a faixa a liberar." }, { status: 400 });
  }

  const from = minutes(start);
  const to = minutes(end);
  const db = getDb();

  const existing = await db
    .select()
    .from(blocks)
    .where(and(eq(blocks.barberId, barberId), eq(blocks.date, date)));

  let removed = 0;
  for (const row of existing) {
    const slot = minutes(row.time);
    if (slot < from || slot >= to) continue;

    await db.delete(blocks).where(eq(blocks.id, row.id));
    removed += 1;
  }

  return Response.json({ removed });
}
