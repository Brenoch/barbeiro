/**
 * Acesso à API da barbearia. Toda requisição vai com `credentials: "include"`
 * porque a sessão viaja num cookie HttpOnly que o JavaScript não enxerga.
 */

export type ApiRole = "client" | "barber" | "admin";

export type ApiSession = {
  role: ApiRole;
  name: string;
  barberId: string | null;
  mustChangePassword: boolean;
};

export type ApiService = {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  active: boolean;
};

export type ApiBarber = {
  id: string;
  name: string;
  specialty: string;
  /** Data URI da foto, ou string vazia quando o barbeiro ainda não enviou. */
  photo: string;
  /** Só chega para a equipe. Vazio no que o cliente recebe. */
  notifyPhone?: string;
  active: boolean;
};

export type ApiAppointment = {
  id: string;
  clientId: string | null;
  client: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  price: number;
  duration: number;
  barberId: string;
  date: string;
  time: string;
  status: "confirmed" | "completed" | "cancelled" | "noshow";
  paid: boolean;
  paymentMethod: string | null;
  autoCompletedAt: string | null;
};

export type ApiAvailability = {
  barberId: string;
  weekday: number;
  enabled: boolean;
  start: string;
  end: string;
};

export type ApiBlock = { id: string; barberId: string; date: string; time: string };

/**
 * Horário indisponível, sem identificar quem ocupou. É o que permite ao
 * cliente ver a agenda cheia sem ver a agenda dos outros.
 */
export type BusySlot = { barberId: string; date: string; time: string; duration: number };

export type ApiShop = {
  shopName: string;
  neighborhood: string;
};

export type Bootstrap = {
  shop: ApiShop;
  services: ApiService[];
  barbers: ApiBarber[];
  availability: ApiAvailability[];
  appointments: ApiAppointment[];
  blocks: ApiBlock[];
  busySlots: BusySlot[];
  /** Falso enquanto as credenciais da Meta não estiverem configuradas. */
  whatsappReady?: boolean;
};

export type ApiAccount = {
  id: string;
  username: string;
  role: ApiRole;
  barberId: string | null;
  displayName: string;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type ApiDevice = {
  id: string;
  role: ApiRole;
  displayName: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

export type ApiNotification = {
  id: string;
  kind: string;
  status: string;
  error: string;
  toPhone: string;
  createdAt: string;
  client: string;
  barberName: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Não foi possível concluir a ação.";
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

const body = (value: unknown) => JSON.stringify(value);

export const api = {
  session: () => call<{ session: ApiSession | null; setupRequired: boolean }>("/api/session"),

  bootstrap: () => call<Bootstrap>("/api/bootstrap"),

  loginStaff: (username: string, password: string) =>
    call<{ session: ApiSession }>("/api/session", {
      method: "POST",
      body: body({ mode: "staff", username, password }),
    }),

  loginClient: (name: string, phone: string) =>
    call<{ session: ApiSession }>("/api/session", {
      method: "POST",
      body: body({ mode: "client", name, phone }),
    }),

  createOwner: (username: string, password: string, name: string) =>
    call<{ session: ApiSession }>("/api/session/setup", {
      method: "POST",
      body: body({ username, password, name }),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    call<{ ok: true }>("/api/session/password", {
      method: "POST",
      body: body({ currentPassword, newPassword }),
    }),

  logout: () => call<{ ok: true }>("/api/session", { method: "DELETE" }),

  // Só o cliente pode chamar isto — agendamento de balcão é entrega futura.
  book: (input: { serviceId: string; barberId: string; date: string; time: string }) =>
    call<{ appointment: ApiAppointment }>("/api/appointments", { method: "POST", body: body(input) }),

  updateAppointment: (input: {
    id: string;
    status: ApiAppointment["status"];
    paid?: boolean;
    paymentMethod?: string;
  }) => call<{ appointment: ApiAppointment }>("/api/appointments", { method: "PATCH", body: body(input) }),

  blockRange: (date: string, start: string, end: string, barberId?: string) =>
    call<{ blocked: number }>("/api/blocks", { method: "POST", body: body({ date, start, end, barberId }) }),

  unblockRange: (date: string, start: string, end: string, barberId?: string) =>
    call<{ removed: number }>("/api/blocks", { method: "DELETE", body: body({ date, start, end, barberId }) }),

  updateAvailability: (weekday: number, changes: Partial<ApiAvailability>) =>
    call<{ ok: true }>("/api/availability", { method: "PATCH", body: body({ weekday, ...changes }) }),

  addService: (name: string, price: number, duration: number) =>
    call<{ service: ApiService }>("/api/services", { method: "POST", body: body({ name, price, duration }) }),

  updateService: (id: string, changes: { active?: boolean; name?: string; price?: number; duration?: number }) =>
    call<{ ok: true }>("/api/services", { method: "PATCH", body: body({ id, ...changes }) }),

  addBarber: (name: string, specialty: string) =>
    call<{ barber: ApiBarber }>("/api/barbers", { method: "POST", body: body({ name, specialty }) }),

  updateBarber: (id: string, changes: { active?: boolean; name?: string; specialty?: string; notifyPhone?: string; photo?: string }) =>
    call<{ ok: true }>("/api/barbers", { method: "PATCH", body: body({ id, ...changes }) }),

  updateSettings: (changes: Partial<ApiShop> & { clearDemo?: boolean }) =>
    call<{ ok: true }>("/api/settings", { method: "PATCH", body: body(changes) }),

  accounts: () => call<{ accounts: ApiAccount[]; barbers: ApiBarber[] }>("/api/security/accounts"),

  createAccount: (username: string, barberId: string) =>
    call<{ username: string; temporaryPassword: string }>("/api/security/accounts", {
      method: "POST",
      body: body({ username, barberId }),
    }),

  updateAccount: (id: string, action: "reset" | "activate" | "deactivate") =>
    call<{ temporaryPassword?: string; active?: boolean }>("/api/security/accounts", {
      method: "PATCH",
      body: body({ id, action }),
    }),

  devices: () => call<{ sessions: ApiDevice[]; clientCount: number }>("/api/security/sessions"),

  revokeDevice: (id: string) =>
    call<{ ok: true }>("/api/security/sessions", { method: "DELETE", body: body({ id }) }),

  notifications: () =>
    call<{ notifications: ApiNotification[]; failedCount: number }>("/api/security/notifications"),
};
