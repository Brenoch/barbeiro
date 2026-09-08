import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { availability } from "@/db/schema";
import { requireRole } from "@/server/session";

export async function PATCH(request: Request) {
  const { session, response } = await requireRole(request, ["barber", "admin"]);
  if (!session) return response;

  const payload = (await request.json()) as {
    barberId?: string;
    weekday?: number;
    enabled?: boolean;
    start?: string;
    end?: string;
  };

  const barberId = session.role === "barber" ? session.barberId ?? "" : payload.barberId ?? "";
  if (!barberId || typeof payload.weekday !== "number") {
    return Response.json({ error: "Informe o barbeiro e o dia da semana." }, { status: 400 });
  }

  const changes: Record<string, unknown> = {};
  if (typeof payload.enabled === "boolean") changes.enabled = payload.enabled;
  if (payload.start) changes.start = payload.start;
  if (payload.end) changes.end = payload.end;
  if (Object.keys(changes).length === 0) return Response.json({ ok: true });

  const db = getDb();
  await db
    .update(availability)
    .set(changes)
    .where(and(eq(availability.barberId, barberId), eq(availability.weekday, payload.weekday)));

  return Response.json({ ok: true });
}
