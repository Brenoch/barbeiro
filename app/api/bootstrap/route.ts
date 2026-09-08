import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointments,
  availability,
  barbers,
  blocks,
  services,
} from "@/db/schema";
import { env } from "cloudflare:workers";
import { finalizeStartedAppointments } from "@/server/automation";
import { readWhatsAppConfig } from "@/server/whatsapp";
import { getSession, touchSession } from "@/server/session";
import { ensureSeed, getSettings } from "@/server/store";

/**
 * Carrega tudo que a sessão atual tem direito de ver. O recorte acontece
 * aqui: o barbeiro não recebe a agenda dos colegas, e o cliente não recebe
 * telefone nem faturamento de ninguém.
 */
export async function GET(request: Request) {
  await ensureSeed();
  await finalizeStartedAppointments();

  const db = getDb();
  const session = await getSession(request);
  if (session) await touchSession(session.id);

  const settings = await getSettings();
  // A tela avisa quando as credenciais da Meta ainda não foram configuradas.
  const whatsappReady = Boolean(readWhatsAppConfig(env as unknown as Record<string, string | undefined>));
  const serviceRows = await db.select().from(services);
  const barberRows = await db.select().from(barbers);
  const availabilityRows = await db.select().from(availability);

  const shop = {
    shopName: settings?.shopName ?? "Bart do Corte",
    neighborhood: settings?.neighborhood ?? "Campo Grande · RJ",
  };

  // O telefone de aviso é dado interno da equipe: nunca sai para o cliente.
  const publicBarbers = barberRows
    .filter(row => row.active)
    .map(row => ({ ...row, notifyPhone: "" }));

  // Visitante sem sessão vê apenas a vitrine.
  if (!session) {
    return Response.json({
      shop,
      services: serviceRows.filter(row => row.active),
      barbers: publicBarbers,
      availability: availabilityRows,
      appointments: [],
      blocks: [],
    });
  }

  if (session.role === "client") {
    const own = await db
      .select()
      .from(appointments)
      .where(eq(appointments.clientId, session.clientId ?? ""));

    return Response.json({
      shop,
      services: serviceRows.filter(row => row.active),
      barbers: publicBarbers,
      availability: availabilityRows,
      appointments: own.map(row => ({ ...row, phone: "" })),
      blocks: [],
    });
  }

  if (session.role === "barber") {
    const barberId = session.barberId ?? "";
    const own = await db.select().from(appointments).where(eq(appointments.barberId, barberId));
    const ownBlocks = await db.select().from(blocks).where(eq(blocks.barberId, barberId));

    return Response.json({
      shop,
      services: serviceRows,
      barbers: barberRows.map(row =>
        row.id === barberId ? row : { ...row, notifyPhone: "" },
      ),
      availability: availabilityRows.filter(row => row.barberId === barberId),
      appointments: own,
      blocks: ownBlocks,
      whatsappReady,
    });
  }

  return Response.json({
    shop: {
      ...shop,
      ownerPhone: settings?.ownerPhone ?? "",
      notifyOwnerAll: settings?.notifyOwnerAll ?? false,
    },
    services: serviceRows,
    barbers: barberRows,
    availability: availabilityRows,
    whatsappReady,
    appointments: await db.select().from(appointments),
    blocks: await db.select().from(blocks),
  });
}
