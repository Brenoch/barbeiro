import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointments,
  availability,
  barbers,
  blocks,
  clients,
  services,
  shopSettings,
} from "@/db/schema";
import { randomId } from "./password";

export function dateISO(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

const SEED_SERVICES = [
  { id: "cut", name: "Corte", description: "Clássico, social ou fade", price: 35, duration: 40 },
  { id: "beard", name: "Barba", description: "Contorno e acabamento", price: 25, duration: 30 },
  { id: "combo", name: "Corte + barba", description: "Experiência completa", price: 55, duration: 60 },
  { id: "kids", name: "Corte infantil", description: "Para os pequenos", price: 30, duration: 35 },
];

const SEED_BARBERS = [
  { id: "bart", name: "Bart", specialty: "Clássicos e barba" },
  { id: "vt", name: "VT", specialty: "Fade e navalhado" },
];

const SEED_AVAILABILITY: Record<string, Partial<Record<number, { start: string; end: string }>>> = {
  bart: { 1: { start: "10:00", end: "21:00" } },
  vt: {
    2: { start: "09:00", end: "18:00" },
    3: { start: "09:00", end: "18:00" },
    4: { start: "09:00", end: "18:00" },
    5: { start: "09:00", end: "18:00" },
    6: { start: "09:00", end: "18:00" },
  },
};

/**
 * Cria o catálogo, a equipe e o expediente na primeira execução. Não cria
 * nenhuma credencial: o acesso do proprietário é definido por quem instala,
 * na tela de primeiro acesso.
 */
export async function ensureSeed() {
  const db = getDb();
  const [settings] = await db.select().from(shopSettings).where(eq(shopSettings.id, "shop")).limit(1);
  if (settings) return;

  await db.insert(shopSettings).values({ id: "shop" });

  for (const service of SEED_SERVICES) {
    await db.insert(services).values({ ...service, active: true });
  }

  for (const barber of SEED_BARBERS) {
    await db.insert(barbers).values({ ...barber, active: true });

    for (let weekday = 0; weekday < 7; weekday += 1) {
      const window = SEED_AVAILABILITY[barber.id]?.[weekday];
      await db.insert(availability).values({
        id: randomId("avl"),
        barberId: barber.id,
        weekday,
        enabled: Boolean(window),
        start: window?.start ?? "09:00",
        end: window?.end ?? "18:00",
      });
    }
  }

  await seedDemoAppointments();
}

/** Agendamentos de vitrine, para a barbearia não abrir o painel vazio. */
async function seedDemoAppointments() {
  const db = getDb();
  const demo = [
    { client: "Cliente 01", phone: "21900000001", serviceId: "combo", barberId: "vt", date: dateISO(), time: "10:00", status: "completed", paid: true, paymentMethod: "Pix" },
    { client: "Cliente 02", phone: "21900000002", serviceId: "cut", barberId: "vt", date: dateISO(), time: "11:00", status: "confirmed", paid: false, paymentMethod: null },
    { client: "Cliente 03", phone: "21900000003", serviceId: "beard", barberId: "bart", date: dateISO(), time: "13:30", status: "confirmed", paid: false, paymentMethod: null },
    { client: "Cliente 04", phone: "21900000004", serviceId: "cut", barberId: "vt", date: dateISO(1), time: "15:00", status: "confirmed", paid: false, paymentMethod: null },
    { client: "Cliente 05", phone: "21900000005", serviceId: "combo", barberId: "bart", date: dateISO(-1), time: "17:00", status: "completed", paid: true, paymentMethod: "Débito" },
  ];

  const seedServiceById = new Map(SEED_SERVICES.map(service => [service.id, service]));

  for (const item of demo) {
    const clientId = await upsertClient(item.client, item.phone);
    const service = seedServiceById.get(item.serviceId);
    await db.insert(appointments).values({
      id: randomId("apt"),
      clientId,
      client: item.client,
      phone: item.phone,
      serviceId: item.serviceId,
      serviceName: service?.name ?? "",
      price: service?.price ?? 0,
      duration: service?.duration ?? 30,
      barberId: item.barberId,
      date: item.date,
      time: item.time,
      status: item.status,
      paid: item.paid,
      paymentMethod: item.paymentMethod,
    });
  }
}

/** Remove agendamentos e clientes de demonstração. */
export async function clearDemoData() {
  const db = getDb();
  const demoPhones = ["21900000001", "21900000002", "21900000003", "21900000004", "21900000005"];

  for (const phone of demoPhones) {
    const [client] = await db.select().from(clients).where(eq(clients.phone, phone)).limit(1);
    if (!client) continue;

    await db.delete(appointments).where(eq(appointments.clientId, client.id));
    await db.delete(clients).where(eq(clients.id, client.id));
  }
}

export async function upsertClient(name: string, phone: string) {
  const db = getDb();
  const normalized = normalizePhone(phone);
  const [existing] = await db.select().from(clients).where(eq(clients.phone, normalized)).limit(1);

  if (existing) {
    if (name && name !== existing.name) {
      await db.update(clients).set({ name }).where(eq(clients.id, existing.id));
    }
    return existing.id;
  }

  const id = randomId("cli");
  await db.insert(clients).values({ id, name: name || "Cliente", phone: normalized });
  return id;
}

export async function getSettings() {
  const db = getDb();
  const [settings] = await db.select().from(shopSettings).where(eq(shopSettings.id, "shop")).limit(1);
  return settings;
}

export function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function timeLabel(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Cada bloqueio guardado cobre esta faixa de minutos a partir do horário. */
export const BLOCK_SLOT_MINUTES = 30;

/**
 * Checa se o horário pode ser reservado. Devolve o motivo da recusa para o
 * cliente entender a diferença entre "já ocupado" e "o barbeiro não atende".
 */
export type SlotCheck = { free: true } | { free: false; reason: string };

export async function checkSlot(
  barberId: string,
  date: string,
  time: string,
  duration: number,
): Promise<SlotCheck> {
  const db = getDb();
  const start = minutes(time);
  const weekday = new Date(`${date}T12:00:00`).getDay();

  const rows = await db.select().from(availability).where(eq(availability.barberId, barberId));
  const window = rows.find(row => row.weekday === weekday);

  if (!window?.enabled) {
    return { free: false, reason: "Este barbeiro não atende neste dia. Escolha outra data." };
  }
  if (start < minutes(window.start) || start + duration > minutes(window.end)) {
    return { free: false, reason: `Fora do expediente. Neste dia o atendimento vai das ${window.start} às ${window.end}.` };
  }

  // Um bloqueio cobre uma faixa de 30 minutos. Um serviço longo pode começar
  // livre e esbarrar num bloqueio mais adiante, então compara a faixa inteira.
  const blocked = await db.select().from(blocks).where(eq(blocks.barberId, barberId));
  const hitsBlock = blocked.some(row => {
    if (row.date !== date) return false;
    const blockStart = minutes(row.time);
    return start < blockStart + BLOCK_SLOT_MINUTES && start + duration > blockStart;
  });

  if (hitsBlock) {
    return { free: false, reason: "Este horário foi bloqueado pelo barbeiro. Escolha outro." };
  }

  // A duração vem congelada em cada agendamento, não do catálogo atual: se o
  // serviço mudar de duração depois, o compromisso já feito não pode se mexer.
  const existing = await db.select().from(appointments).where(eq(appointments.barberId, barberId));

  const busy = existing.some(row => {
    if (row.date !== date || row.status === "cancelled") return false;
    const rowStart = minutes(row.time);
    return start < rowStart + row.duration && start + duration > rowStart;
  });

  if (busy) return { free: false, reason: "Este horário acabou de ser ocupado. Escolha outro." };
  return { free: true };
}
