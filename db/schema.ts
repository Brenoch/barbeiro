import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Configuração da barbearia. Sempre uma única linha, com id "shop". */
export const shopSettings = sqliteTable("shop_settings", {
  id: text("id").primaryKey().default("shop"),
  shopName: text("shop_name").notNull().default("Bart do Corte"),
  neighborhood: text("neighborhood").notNull().default("Campo Grande · RJ"),
});

export const services = sqliteTable("services", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  price: integer("price").notNull(),
  duration: integer("duration").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const barbers = sqliteTable("barbers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  specialty: text("specialty").notNull().default(""),
  /** Foto do barbeiro como data URI. Poucos registros, então cabe no D1. */
  photo: text("photo").notNull().default(""),
  /** WhatsApp que recebe os avisos dos agendamentos deste barbeiro. */
  notifyPhone: text("notify_phone").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/** Credenciais de barbeiro e proprietário. Nunca guarda a senha em texto. */
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    barberId: text("barber_id"),
    displayName: text("display_name").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /** Senha provisória: obriga a troca no primeiro acesso. */
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
    lastLoginAt: text("last_login_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  table => [uniqueIndex("accounts_username_idx").on(table.username)],
);

export const clients = sqliteTable(
  "clients",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  table => [uniqueIndex("clients_phone_idx").on(table.phone)],
);

/**
 * Sessões ativas. O cookie carrega o token em texto, o banco guarda só o
 * hash — vazamento do banco não permite entrar como ninguém.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    role: text("role").notNull(),
    accountId: text("account_id"),
    clientId: text("client_id"),
    displayName: text("display_name").notNull(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
  },
  table => [
    uniqueIndex("sessions_token_idx").on(table.tokenHash),
    index("sessions_account_idx").on(table.accountId),
  ],
);

export const appointments = sqliteTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id"),
    client: text("client").notNull(),
    phone: text("phone").notNull().default(""),
    serviceId: text("service_id").notNull(),
    /**
     * Nome e preço do serviço no momento do agendamento. Um reajuste de preço
     * feito depois não pode mudar o faturamento de um mês que já fechou, e o
     * histórico precisa continuar legível mesmo se o serviço for renomeado.
     */
    serviceName: text("service_name").notNull().default(""),
    price: integer("price").notNull().default(0),
    duration: integer("duration").notNull().default(30),
    barberId: text("barber_id").notNull(),
    date: text("date").notNull(),
    time: text("time").notNull(),
    status: text("status").notNull().default("confirmed"),
    paid: integer("paid", { mode: "boolean" }).notNull().default(false),
    paymentMethod: text("payment_method"),
    autoCompletedAt: text("auto_completed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  table => [
    index("appointments_date_idx").on(table.date),
    index("appointments_barber_idx").on(table.barberId),
  ],
);

export const blocks = sqliteTable(
  "blocks",
  {
    id: text("id").primaryKey(),
    barberId: text("barber_id").notNull(),
    date: text("date").notNull(),
    time: text("time").notNull(),
  },
  table => [index("blocks_lookup_idx").on(table.barberId, table.date)],
);

export const availability = sqliteTable(
  "availability",
  {
    id: text("id").primaryKey(),
    barberId: text("barber_id").notNull(),
    weekday: integer("weekday").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    start: text("start").notNull().default("09:00"),
    end: text("end").notNull().default("18:00"),
  },
  table => [uniqueIndex("availability_barber_weekday_idx").on(table.barberId, table.weekday)],
);


/**
 * Registro dos avisos enviados por WhatsApp.
 *
 * Existe para responder "mandou ou não mandou?" quando a barbearia disser que
 * não recebeu. Sem isso, uma falha de envio some sem deixar rastro.
 */
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    appointmentId: text("appointment_id").notNull(),
    /** "created" para novo agendamento, "cancelled" para cancelamento. */
    kind: text("kind").notNull(),
    toPhone: text("to_phone").notNull(),
    /** "sent" ou "failed". */
    status: text("status").notNull(),
    error: text("error").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  table => [index("notifications_appointment_idx").on(table.appointmentId)],
);
