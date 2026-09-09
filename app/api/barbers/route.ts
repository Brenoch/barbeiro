import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, availability, barbers } from "@/db/schema";
import { randomId } from "@/server/password";
import { destroyAccountSessions, getSession, forbidden, requireRole, unauthorized } from "@/server/session";

/** Teto do que é aceito no banco, depois da compressão feita no navegador. */
const MAX_PHOTO_BYTES = 300_000;
const ALLOWED_PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * Cadastra um barbeiro novo. Nasce com a semana inteira fechada: quem define
 * os dias em que atende é o próprio barbeiro, na tela de Horários.
 */
export async function POST(request: Request) {
  const { session, response } = await requireRole(request, ["admin"]);
  if (!session) return response;

  const payload = (await request.json()) as { name?: string; specialty?: string };
  const name = payload.name?.trim() ?? "";

  if (name.length < 2) {
    return Response.json({ error: "Informe o nome do barbeiro." }, { status: 400 });
  }

  const db = getDb();
  const id = randomId("brb");

  const [created] = await db
    .insert(barbers)
    .values({
      id,
      name: name.slice(0, 40),
      specialty: (payload.specialty ?? "").trim().slice(0, 60),
      photo: "",
      active: true,
    })
    .returning();

  for (let weekday = 0; weekday < 7; weekday += 1) {
    await db.insert(availability).values({
      id: randomId("avl"),
      barberId: id,
      weekday,
      enabled: false,
      start: "09:00",
      end: "18:00",
    });
  }

  return Response.json({ barber: created }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getSession(request);
  if (!session) return unauthorized();
  if (session.role === "client") return forbidden();

  const payload = (await request.json()) as {
    id?: string;
    active?: boolean;
    name?: string;
    specialty?: string;
    notifyPhone?: string;
    photo?: string;
  };

  // O barbeiro só mexe no próprio cadastro; o proprietário mexe em qualquer um.
  const id = session.role === "barber" ? session.barberId ?? "" : payload.id ?? "";
  if (!id) return Response.json({ error: "Informe o barbeiro." }, { status: 400 });
  if (session.role === "barber" && payload.id && payload.id !== id) {
    return forbidden("Você só pode alterar o seu próprio cadastro.");
  }

  const changes: Record<string, unknown> = {};

  if (typeof payload.photo === "string") {
    const photo = payload.photo.trim();

    if (photo === "") {
      changes.photo = "";
    } else if (!ALLOWED_PHOTO.test(photo)) {
      return Response.json({ error: "Envie uma imagem JPEG, PNG ou WEBP." }, { status: 400 });
    } else if (photo.length > MAX_PHOTO_BYTES) {
      return Response.json({ error: "A imagem ficou grande demais. Tente outra foto." }, { status: 413 });
    } else {
      changes.photo = photo;
    }
  }

  if (typeof payload.specialty === "string") {
    changes.specialty = payload.specialty.trim().slice(0, 60);
  }

  if (typeof payload.notifyPhone === "string") {
    changes.notifyPhone = payload.notifyPhone.trim().slice(0, 30);
  }

  // Ativar, desativar e renomear continuam sendo decisão do proprietário.
  if (typeof payload.active === "boolean") {
    if (session.role !== "admin") return forbidden();
    changes.active = payload.active;
  }

  if (typeof payload.name === "string") {
    if (session.role !== "admin") return forbidden();
    const name = payload.name.trim();
    if (name.length < 2) return Response.json({ error: "Informe o nome do barbeiro." }, { status: 400 });
    changes.name = name.slice(0, 40);
  }

  if (Object.keys(changes).length === 0) return Response.json({ ok: true });

  const db = getDb();
  await db.update(barbers).set(changes).where(eq(barbers.id, id));

  // Mesma pessoa dos dois lados: esconder o barbeiro do agendamento também
  // derruba o login dele, senão ele continua entrando numa agenda que o
  // cliente não enxerga mais.
  if (typeof changes.active === "boolean") {
    const [linkedAccount] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.barberId, id))
      .limit(1);

    if (linkedAccount) {
      await db.update(accounts).set({ active: changes.active }).where(eq(accounts.id, linkedAccount.id));
      if (!changes.active) await destroyAccountSessions(linkedAccount.id);
    }
  }

  return Response.json({ ok: true });
}
