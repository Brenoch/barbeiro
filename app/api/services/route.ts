import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { services } from "@/db/schema";
import { randomId } from "@/server/password";
import { requireRole } from "@/server/session";

export async function POST(request: Request) {
  const { session, response } = await requireRole(request, ["admin"]);
  if (!session) return response;

  const payload = (await request.json()) as { name?: string; price?: number; duration?: number };
  const name = payload.name?.trim() ?? "";
  const price = Number(payload.price);
  const duration = Number(payload.duration);

  if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(duration) || duration <= 0) {
    return Response.json({ error: "Informe nome, preço e duração válidos." }, { status: 400 });
  }

  const db = getDb();
  const [created] = await db
    .insert(services)
    .values({ id: randomId("srv"), name, description: "Novo serviço", price, duration, active: true })
    .returning();

  return Response.json({ service: created }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { session, response } = await requireRole(request, ["admin"]);
  if (!session) return response;

  const payload = (await request.json()) as {
    id?: string;
    active?: boolean;
    name?: string;
    price?: number;
    duration?: number;
  };
  if (!payload.id) return Response.json({ error: "Informe o serviço." }, { status: 400 });

  const changes: Record<string, unknown> = {};
  if (typeof payload.active === "boolean") changes.active = payload.active;

  if (typeof payload.name === "string") {
    const name = payload.name.trim();
    if (!name) return Response.json({ error: "O nome não pode ficar vazio." }, { status: 400 });
    changes.name = name.slice(0, 60);
  }

  if (payload.price !== undefined) {
    const price = Number(payload.price);
    if (!Number.isFinite(price) || price < 0) {
      return Response.json({ error: "Informe um preço válido." }, { status: 400 });
    }
    changes.price = price;
  }

  // Mudar a duração muda quais horários cabem na agenda, então precisa ser
  // um número de minutos de verdade.
  if (payload.duration !== undefined) {
    const duration = Number(payload.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      return Response.json({ error: "Informe uma duração válida em minutos." }, { status: 400 });
    }
    changes.duration = duration;
  }

  if (Object.keys(changes).length === 0) return Response.json({ ok: true });

  const db = getDb();
  await db.update(services).set(changes).where(eq(services.id, payload.id));
  return Response.json({ ok: true });
}
