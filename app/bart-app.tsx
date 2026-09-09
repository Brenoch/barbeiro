"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, type ApiAccount, type ApiDevice, type Bootstrap, type BusySlot } from "./api-client";
import { saveToCalendar, type CalendarEvent } from "./calendar";
import { ACCEPTED_PHOTO_TYPES, PhotoError, prepareBarberPhoto } from "./photo";
import { calculateRevenue } from "./revenue";

type Role = "client" | "barber" | "admin";
type Screen = "home" | "agenda" | "team" | "availability" | "management" | "profile" | "access" | "security";
type Status = "confirmed" | "completed" | "cancelled" | "noshow";
type IconName = "home" | "calendar" | "plus" | "scissors" | "user" | "grid" | "wallet" | "arrow-right" | "arrow-left" | "arrow-up-right" | "check" | "close" | "download" | "lock";

const iconPaths: Record<IconName, React.ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 21v-6h6v6" /></>, calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>, plus: <path d="M12 5v14M5 12h14" />, scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="m8.6 7.5 10.4 9M8.6 16.5 19 7.5" /></>, user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6" /></>, grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>, wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a1 1 0 0 1 1 1v2H6.5A2.5 2.5 0 0 0 4 10.5v7A2.5 2.5 0 0 0 6.5 20H20v-3" /><path d="M20 10h-5a2 2 0 0 0 0 4h5z" /></>, "arrow-right": <path d="M5 12h14m-6-6 6 6-6 6" />, "arrow-left": <path d="M19 12H5m6 6-6-6 6-6" />, "arrow-up-right": <path d="M7 17 17 7m-7 0h7v7" />, check: <path d="m5 12 4.5 4.5L19 7" />, close: <path d="m6 6 12 12M18 6 6 18" />, download: <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />, lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
};

function Icon({ name, label }: { name: IconName; label?: string }) { return <svg className="icon" viewBox="0 0 24 24" aria-hidden={label ? undefined : true} aria-label={label} role={label ? "img" : undefined} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>; }

type Service = {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  active: boolean;
};

type Barber = {
  id: string;
  name: string;
  specialty: string;
  photo: string;
  /** Vem vazio para o cliente: é dado interno da equipe. */
  notifyPhone: string;
  active: boolean;
};

type Appointment = {
  id: string;
  client: string;
  phone: string;
  serviceId: string;
  barberId: string;
  date: string;
  time: string;
  status: Status;
  paid: boolean;
  paymentMethod?: "Pix" | "Dinheiro" | "Débito" | "Crédito";
  autoCompletedAt?: string;
};

type WorkDay = {
  weekday: number;
  enabled: boolean;
  start: string;
  end: string;
};

type Session = {
  role: Role;
  name: string;
  barberId: string | null;
  mustChangePassword: boolean;
  /** Guardado apenas no aparelho, para preencher a tela de perfil. */
  phone?: string;
};

type StoreData = {
  services: Service[];
  barbers: Barber[];
  appointments: Appointment[];
  blocks: { id: string; barberId: string; date: string; time: string }[];
  /** Horários já tomados, sem dizer de quem. Vem pronto do servidor. */
  busySlots: BusySlot[];
  availability: Record<string, WorkDay[]>;
  shopName: string;
  neighborhood: string;
  whatsappReady: boolean;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function defaultWeek(overrides: Partial<Record<number, { start: string; end: string }>>): WorkDay[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    enabled: Boolean(overrides[weekday]),
    start: overrides[weekday]?.start ?? "09:00",
    end: overrides[weekday]?.end ?? "18:00",
  }));
}

const emptyData: StoreData = {
  services: [],
  barbers: [],
  appointments: [],
  blocks: [],
  busySlots: [],
  availability: {},
  shopName: "Bart do Corte",
  neighborhood: "Campo Grande · RJ",
  whatsappReady: false,
};

/** Converte a resposta da API no formato que as telas já consomem. */
function toStoreData(payload: Bootstrap): StoreData {
  const availability: Record<string, WorkDay[]> = {};
  for (const row of payload.availability) {
    const week = availability[row.barberId] ?? defaultWeek({});
    week[row.weekday] = { weekday: row.weekday, enabled: row.enabled, start: row.start, end: row.end };
    availability[row.barberId] = week;
  }

  return {
    services: payload.services,
    barbers: payload.barbers.map(item => ({ ...item, notifyPhone: item.notifyPhone ?? "" })),
    appointments: payload.appointments.map(item => ({
      ...item,
      paymentMethod: (item.paymentMethod ?? undefined) as Appointment["paymentMethod"],
      autoCompletedAt: item.autoCompletedAt ?? undefined,
    })),
    blocks: payload.blocks,
    busySlots: payload.busySlots ?? [],
    availability,
    shopName: payload.shop.shopName,
    neighborhood: payload.shop.neighborhood,
    whatsappReady: payload.whatsappReady ?? false,
  };
}

function dateISO(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

const roleLabels: Record<Role, string> = { client: "Cliente", barber: "Barbeiro", admin: "Proprietário" };
const statusLabels: Record<Status, string> = { confirmed: "Confirmado", completed: "Concluído", cancelled: "Cancelado", noshow: "Faltou" };

function minutes(value: string) {
  const [hour, min] = value.split(":").map(Number);
  return hour * 60 + min;
}

function timeLabel(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Precisa bater com BLOCK_SLOT_MINUTES no servidor: um bloqueio = 30 min. */
const BLOCK_SLOT_MINUTES = 30;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function weekday(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(new Date(`${value}T12:00:00`)).replace(".", "");
}

type Credentials = {
  name: string;
  phone: string;
  username: string;
  password: string;
  newPassword: string;
};

const emptyCredentials: Credentials = { name: "", phone: "", username: "", password: "", newPassword: "" };

/** Etapas da tela de acesso, conforme o portal e o estado da instalação. */
type AccessStep = "staff" | "setup" | "client" | "change-password";

export default function BartApp() {
  const [data, setData] = useState<StoreData>(emptyData);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [portal, setPortal] = useState<Role>("client");
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedDate, setSelectedDate] = useState(dateISO());
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  const [booking, setBooking] = useState({ serviceId: "", barberId: "", date: dateISO(1), time: "" });
  const [bookedEvent, setBookedEvent] = useState<CalendarEvent | null>(null);
  const [toast, setToast] = useState("");
  const [accessMode, setAccessMode] = useState<Role>("client");
  const [accessStep, setAccessStep] = useState<AccessStep>("client");
  const [setupRequired, setSetupRequired] = useState(false);
  const [pendingBooking, setPendingBooking] = useState(false);
  const [credentials, setCredentials] = useState<Credentials>(emptyCredentials);
  const [loginError, setLoginError] = useState("");
  const [newService, setNewService] = useState({ name: "", price: "", duration: "" });
  const [busy, setBusy] = useState(false);
  const role: Role = session?.role ?? portal;
  const currentBarberId = session?.barberId ?? null;

  const refresh = useCallback(async () => {
    const payload = await api.bootstrap();
    setData(toStoreData(payload));
  }, []);

  /** Executa uma ação da API e traz os dados atualizados do servidor. */
  const run = useCallback(
    async (action: () => Promise<unknown>, successMessage?: string) => {
      setBusy(true);
      try {
        await action();
        await refresh();
        if (successMessage) setToast(successMessage);
        return true;
      } catch (error) {
        setToast(error instanceof ApiError ? error.message : "Falha de conexão com a barbearia.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- estado inicial vem do servidor */
  useEffect(() => {
    const path = window.location.pathname.replace(/\/+$/, "");
    const routeRole: Role = path === "/barbeiro" ? "barber" : path === "/barbearia" ? "admin" : "client";
    setPortal(routeRole);
    setAccessMode(routeRole);

    (async () => {
      try {
        const status = await api.session();
        setSetupRequired(status.setupRequired);
        setSession(status.session);

        // O proprietário ainda não existe: a primeira visita cria o acesso.
        if (routeRole === "admin" && status.setupRequired) {
          setAccessStep("setup");
          setScreen("access");
        } else if (status.session?.mustChangePassword) {
          setAccessStep("change-password");
          setScreen("access");
        } else if (routeRole !== "client" && status.session?.role !== routeRole) {
          // Uma sessão de cliente não abre o portal da equipe.
          setAccessStep("staff");
          setScreen("access");
        } else {
          setAccessStep(routeRole === "client" ? "client" : "staff");
        }

        await refresh();
      } catch {
        setToast("Não foi possível falar com o servidor da barbearia.");
      } finally {
        setReady(true);
      }
    })();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * Recarrega ao voltar para a aba e a cada minuto. É o que faz o agendamento
   * feito no celular do cliente aparecer sozinho na tela do barbeiro.
   */
  useEffect(() => {
    if (!ready) return;

    const sync = () => {
      if (document.visibilityState === "visible") refresh().catch(() => undefined);
    };

    const timer = window.setInterval(sync, 60_000);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [ready, refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const services = useMemo(() => new Map(data.services.map(item => [item.id, item])), [data.services]);
  const barbers = useMemo(() => new Map(data.barbers.map(item => [item.id, item])), [data.barbers]);
  const completed = data.appointments.filter(item => item.status === "completed");
  const currentDate = dateISO();
  const revenue = calculateRevenue(data.appointments, services, currentDate);
  const barberAppointments = data.appointments.filter(item => item.barberId === currentBarberId);
  const barberRevenue = calculateRevenue(barberAppointments, services, currentDate);
  // Ordenado por horário: é a ordem em que os clientes vão chegar.
  const todayAppointments = data.appointments
    .filter(item => item.date === currentDate && item.status !== "cancelled")
    .sort((a, b) => a.time.localeCompare(b.time));

  /**
   * Grade de horários do dia escolhido.
   *
   * Só entram horários dentro do expediente do barbeiro: mostrar 08:00 quando
   * ele abre às 09:00 fazia a agenda parecer cheia sem ter ninguém marcado.
   * Aqui, cinza significa uma coisa só — já foi tomado.
   *
   * A ocupação vem de `busySlots`, montado no servidor. O cliente não enxerga
   * a agenda dos outros, mas precisa saber o que já foi pego, senão escolhe um
   * horário e só descobre na confirmação que não dava.
   */
  const timeSlots = useMemo(() => {
    const result: { time: string; available: boolean }[] = [];
    const duration = services.get(booking.serviceId)?.duration ?? 30;
    const day = new Date(`${booking.date}T12:00:00`).getDay();
    const schedule = data.availability[booking.barberId]?.find(item => item.weekday === day);
    if (!schedule?.enabled) return result;

    const opens = minutes(schedule.start);
    const closes = minutes(schedule.end);
    const busy = data.busySlots.filter(item => item.date === booking.date && item.barberId === booking.barberId);

    for (let value = opens; value + duration <= closes; value += 30) {
      const taken = busy.some(item => {
        const start = minutes(item.time);
        return value < start + item.duration && value + duration > start;
      });
      result.push({ time: timeLabel(value), available: !taken });
    }
    return result;
  }, [booking, data.availability, data.busySlots, services]);

  const navItems: [string, IconName, string][] = role === "client"
    ? [["home", "home", "Início"], ["agenda", "calendar", "Agendamentos"], ["plus", "plus", "Agendar"], ["team", "scissors", "Equipe"], ["profile", "user", "Perfil"]]
    : role === "barber"
      ? [["home", "home", "Resumo"], ["agenda", "calendar", "Agenda"], ["availability", "calendar", "Horários"], ["management", "wallet", "Produção"], ["profile", "user", "Perfil"]]
      : [["home", "grid", "Visão geral"], ["agenda", "calendar", "Agenda"], ["management", "grid", "Gestão"], ["security", "lock", "Acessos"], ["profile", "user", "Perfil"]];

  function openAccess(mode: Role, wantsBooking = false) {
    setAccessMode(mode);
    setAccessStep(mode === "client" ? "client" : setupRequired && mode === "admin" ? "setup" : "staff");
    setPendingBooking(wantsBooking);
    setCredentials(emptyCredentials);
    setLoginError("");
    setScreen("access");
  }

  function afterLogin(next: Session) {
    setSession(next);
    setCredentials(emptyCredentials);

    if (next.mustChangePassword) {
      setAccessStep("change-password");
      setScreen("access");
      setToast("Defina uma senha nova para continuar");
      return;
    }

    setScreen("home");
    setToast(next.role === "client" ? `Olá, ${next.name.split(" ")[0]}!` : `Acesso de ${next.name} liberado`);
    refresh().catch(() => undefined);
    if (pendingBooking) window.setTimeout(openBooking, 0);
    setPendingBooking(false);
  }

  async function submitAccess() {
    if (busy) return;
    setLoginError("");
    setBusy(true);

    try {
      if (accessStep === "setup") {
        const { session: created } = await api.createOwner(credentials.username, credentials.password, credentials.name);
        setSetupRequired(false);
        afterLogin(created);
        return;
      }

      if (accessStep === "change-password") {
        await api.changePassword(credentials.password, credentials.newPassword);
        setSession(current => (current ? { ...current, mustChangePassword: false } : current));
        setCredentials(emptyCredentials);
        setScreen("home");
        setToast("Senha atualizada");
        return;
      }

      if (accessStep === "client") {
        const { session: created } = await api.loginClient(credentials.name, credentials.phone);
        afterLogin({ ...created, phone: credentials.phone });
        return;
      }

      const { session: created } = await api.loginStaff(credentials.username, credentials.password);
      afterLogin(created);
    } catch (error) {
      setLoginError(error instanceof ApiError ? error.message : "Não foi possível entrar agora.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api.logout().catch(() => undefined);
    setSession(null);
    setCredentials(emptyCredentials);
    setAccessStep(portal === "client" ? "client" : "staff");
    setScreen(portal === "client" ? "home" : "access");
    setToast("Você saiu deste acesso");
    refresh().catch(() => undefined);
  }

  function navigate(target: string) {
    if (target === "plus") {
      requestBooking();
      return;
    }
    if (!session && (target === "agenda" || target === "profile")) {
      openAccess("client");
      return;
    }
    setScreen(target as Screen);
  }

  function requestBooking() {
    if (!session) {
      openAccess("client", true);
      return;
    }
    openBooking();
  }

  function openBooking() {
    setBooking({ serviceId: "", barberId: "", date: dateISO(1), time: "" });
    setBookedEvent(null);
    setBookingStep(1);
    setBookingOpen(true);
  }

  async function confirmBooking() {
    let created: string | null = null;

    const ok = await run(async () => {
      const result = await api.book({
        serviceId: booking.serviceId,
        barberId: booking.barberId,
        date: booking.date,
        time: booking.time,
      });
      created = result.appointment.id;
    }, "Horário reservado com sucesso");

    if (!ok || !created) return;

    setBookedEvent({
      id: created,
      date: booking.date,
      time: booking.time,
      durationMinutes: services.get(booking.serviceId)?.duration ?? 30,
      serviceName: services.get(booking.serviceId)?.name ?? "Atendimento",
      barberName: barbers.get(booking.barberId)?.name ?? "a equipe",
      shopName: data.shopName,
      neighborhood: data.neighborhood,
    });
    setSelectedDate(booking.date);
    setBookingStep(5);
  }

  function closeBooking() {
    setBookingOpen(false);
    if (bookedEvent) setScreen("agenda");
    setBookedEvent(null);
  }

  function updateAppointment(id: string, status: Status, paid?: boolean) {
    void run(
      () => api.updateAppointment({ id, status, paid }),
      status === "completed" ? "Atendimento concluído" : "Agendamento atualizado",
    );
  }

  function blockRange(start: string, end: string) {
    if (!currentBarberId) return;
    void run(() => api.blockRange(selectedDate, start, end), `Bloqueado das ${start} às ${end}`);
  }

  function unblockRange(start: string, end: string) {
    if (!currentBarberId) return;
    void run(() => api.unblockRange(selectedDate, start, end), "Horário liberado");
  }

  function updateAvailability(weekdayNumber: number, changes: Partial<WorkDay>) {
    if (!currentBarberId) return;
    void run(() => api.updateAvailability(weekdayNumber, changes), "Disponibilidade atualizada");
  }

  function addService() {
    if (!newService.name || !newService.price || !newService.duration) return;
    void run(async () => {
      await api.addService(newService.name, Number(newService.price), Number(newService.duration));
      setNewService({ name: "", price: "", duration: "" });
    }, "Serviço cadastrado");
  }


  // Portal da equipe exige uma sessão do mesmo papel: estar logado como
  // cliente não dá acesso a /barbeiro nem a /barbearia.
  const accessRequired = screen === "access" || (portal !== "client" && session?.role !== portal) || Boolean(session?.mustChangePassword);

  if (!ready) {
    return <main className="app-shell"><section className="app-frame"><div className="app-content"><div className="boot-state"><span className="boot-spinner" aria-hidden="true" /><p>Carregando a barbearia…</p></div></div></section></main>;
  }

  return (
    <main className="app-shell">
      <section className="app-frame">
        <Header role={role} session={session} items={accessRequired ? [] : navItems} screen={screen} onNavigate={navigate} onOpen={() => session ? setScreen("profile") : openAccess(portal)} />

        <div className="app-content">
          {accessRequired && <AccessScreen mode={accessMode} step={accessStep} credentials={credentials} setCredentials={setCredentials} error={loginError} busy={busy} submit={submitAccess} cancel={() => { setPendingBooking(false); if (portal === "client") setScreen("home"); else window.location.assign("/"); }} />}
          {!accessRequired && <>
            {screen === "home" && role === "client" && <ClientHome data={data} session={session} openBooking={requestBooking} setScreen={setScreen} />}
            {screen === "home" && role === "barber" && <BarberHome barberName={session?.name ?? "Barbeiro"} appointments={todayAppointments.filter(item => item.barberId === currentBarberId)} services={services} revenue={barberRevenue} />}
            {screen === "home" && role === "admin" && <AdminHome data={data} services={services} revenue={revenue} todayAppointments={todayAppointments} setScreen={setScreen} />}
            {screen === "agenda" && <AgendaScreen role={role} barberId={currentBarberId} data={data} services={services} barbers={barbers} selectedDate={selectedDate} setSelectedDate={setSelectedDate} updateAppointment={updateAppointment} blockRange={blockRange} unblockRange={unblockRange} />}
            {screen === "team" && <TeamScreen data={data} openBooking={requestBooking} />}
            {screen === "availability" && role === "barber" && currentBarberId && <AvailabilityScreen barberName={session?.name ?? "Barbeiro"} days={data.availability[currentBarberId] ?? defaultWeek({})} updateDay={updateAvailability} />}
            {screen === "management" && role === "barber" && <EarningsScreen appointments={completed.filter(item => item.barberId === currentBarberId)} services={services} revenue={barberRevenue.month} />}
            {screen === "management" && role === "admin" && <ManagementScreen data={data} run={run} newService={newService} setNewService={setNewService} addService={addService} />}
            {screen === "security" && role === "admin" && <SecurityScreen setToast={setToast} />}
            {screen === "profile" && session && <ProfileScreen session={session} whatsappReady={data.whatsappReady} barber={currentBarberId ? barbers.get(currentBarberId) ?? null : null} run={run} logout={logout} />}
          </>}
        </div>

        {!accessRequired && <BottomNav items={navItems} screen={screen} onNavigate={navigate} />}
      </section>

      {bookingOpen && (
        <BookingSheet
          step={bookingStep}
          setStep={setBookingStep}
          booking={booking}
          setBooking={setBooking}
          data={data}
          timeSlots={timeSlots}
          bookedEvent={bookedEvent}
          close={closeBooking}
          confirm={confirmBooking}
        />
      )}
      {toast && <div className="toast"><Icon name="check" />{toast}</div>}
    </main>
  );
}

const accessCopy: Record<AccessStep, { overline: string; title: string; subtitle: string; action: string }> = {
  setup: { overline: "PRIMEIRO ACESSO", title: "Criar acesso do proprietário", subtitle: "Escolha o usuário e a senha do painel. Ninguém mais consegue criar este acesso depois.", action: "CRIAR ACESSO" },
  staff: { overline: "ÁREA RESERVADA", title: "Entrar no painel", subtitle: "Use o acesso que a barbearia cadastrou para você.", action: "ENTRAR NO PAINEL" },
  client: { overline: "IDENTIFICAÇÃO", title: "Antes de agendar", subtitle: "Seu nome e telefone para a barbearia saber quem chega e conseguir avisar você.", action: "CONTINUAR PARA AGENDAR" },
  "change-password": { overline: "SEGURANÇA", title: "Defina sua senha", subtitle: "Sua senha é provisória. Escolha uma nova para continuar.", action: "SALVAR NOVA SENHA" },
};

function AccessScreen({ mode, step, credentials, setCredentials, error, busy, submit, cancel }: { mode: Role; step: AccessStep; credentials: Credentials; setCredentials: (value: Credentials) => void; error: string; busy: boolean; submit: () => void; cancel: () => void }) {
  const copy = accessCopy[step];
  const staffPlaceholder = mode === "barber" ? "Seu nome de barbeiro" : "Nome de acesso";

  return <div className="access-page">
    {step !== "change-password" && <button className="access-back" onClick={cancel}><Icon name="arrow-left" /> VOLTAR AO SITE</button>}
    <section className="access-card">
      <div className="access-brand"><img src="/bart-logo.jpg" alt="" /><span>BART DO CORTE</span></div>
      <small>{copy.overline}</small>
      <h1>{copy.title}</h1>
      <p>{copy.subtitle}</p>
      <form onSubmit={event => { event.preventDefault(); submit(); }}>
        {step === "setup" && <>
          <label>SEU NOME<input autoComplete="name" value={credentials.name} onChange={event => setCredentials({ ...credentials, name: event.target.value })} placeholder="Nome do proprietário" /></label>
          <label>NOME DE ACESSO<input autoComplete="username" value={credentials.username} onChange={event => setCredentials({ ...credentials, username: event.target.value })} placeholder="Ex.: barbearia" /></label>
          <label>SENHA<input type="password" autoComplete="new-password" value={credentials.password} onChange={event => setCredentials({ ...credentials, password: event.target.value })} placeholder="Mínimo de 8 caracteres" /></label>
        </>}

        {step === "staff" && <>
          <label>NOME DE ACESSO<input autoComplete="username" value={credentials.username} onChange={event => setCredentials({ ...credentials, username: event.target.value })} placeholder={staffPlaceholder} /></label>
          <label>SENHA<input type="password" autoComplete="current-password" value={credentials.password} onChange={event => setCredentials({ ...credentials, password: event.target.value })} placeholder="Sua senha" /></label>
        </>}

        {step === "client" && <>
          <label>SEU NOME<input autoComplete="name" value={credentials.name} onChange={event => setCredentials({ ...credentials, name: event.target.value })} placeholder="Como podemos te chamar?" /></label>
          <label>WHATSAPP<input inputMode="tel" autoComplete="tel" value={credentials.phone} onChange={event => setCredentials({ ...credentials, phone: event.target.value })} placeholder="(21) 99999-9999" /></label>
        </>}

        {step === "change-password" && <>
          <label>SENHA ATUAL<input type="password" autoComplete="current-password" value={credentials.password} onChange={event => setCredentials({ ...credentials, password: event.target.value })} placeholder="A senha provisória" /></label>
          <label>NOVA SENHA<input type="password" autoComplete="new-password" value={credentials.newPassword} onChange={event => setCredentials({ ...credentials, newPassword: event.target.value })} placeholder="Mínimo de 8 caracteres" /></label>
        </>}

        {error && <div className="access-error" role="alert">{error}</div>}
        <button className="access-submit" type="submit" disabled={busy}>{busy ? "AGUARDE…" : copy.action}<Icon name="arrow-right" /></button>
      </form>
    </section>
  </div>;
}

function Header({ role, session, items, screen, onNavigate, onOpen }: { role: Role; session: Session | null; items: [string, IconName, string][]; screen: Screen; onNavigate: (target: string) => void; onOpen: () => void }) {
  const initials = session?.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "→";
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <img src="/bart-logo.jpg" alt="Bart do Corte" />
        <div><span>BARBEARIA</span><strong>BART DO CORTE</strong><em>Ter–Sex 09–19h · Sáb 09–18h</em></div>
      </div>
      <nav className="desktop-top-nav" aria-label="Navegação para desktop">{items.map(([target, icon, label]) => <button key={target} className={`${target === "plus" ? "desktop-top-cta" : ""} ${screen === target ? "active" : ""}`} onClick={() => onNavigate(target)}><Icon name={icon} /><b>{label}</b></button>)}</nav>
      <button className="role-button" onClick={onOpen}><span>{session ? `${roleLabels[role]} · ${session.name}` : "Entrar"}</span><b>{initials}</b></button>
    </header>
  );
}

function Marquee() {
  const items = ["CORTES MASCULINOS", "BARBA & ACABAMENTO", "AGENDE PELO APP", "CAMPO GRANDE · RJ", "SEU ESTILO, SEU HORÁRIO"];
  return <div className="marquee"><div className="marquee-track">{[...items, ...items].map((item, index) => <span key={`${item}-${index}`}><i />{item}</span>)}</div></div>;
}

const haircutGallery = [
  { image: "/referencia-corte-barba.jpg", imagePosition: "center", name: "Corte & barba", detail: "Corte completo com acabamento da barba", price: 50, duration: "40 min" },
  { image: "/referencia-corte-infantil.jpg", imagePosition: "center", name: "Corte infantil", detail: "Corte pensado para os pequenos", price: 35, duration: "30 min" },
  { image: "/referencia-pigmentacao.jpg", imagePosition: "center", name: "Corte + pigmentação", detail: "Acabamento com pigmentação", price: 40, duration: "45 min" },
  { image: "/referencia-nevou.jpg", imagePosition: "center", name: "Nevou - colorido", detail: "Descoloração e cor", price: 95, duration: "2 h" },
  { image: null, imagePosition: "center", name: "Pezinho + sobrancelha + bigode", detail: "Acabamento preciso nos detalhes", price: 15, duration: "20 min" },
  { image: "/referencia-reflexo.jpg", imagePosition: "center", name: "Reflexo", detail: "Mechas e iluminação", price: 80, duration: "1 h" },
];

function ClientHome({ data, session, openBooking, setScreen }: { data: StoreData; session: Session | null; openBooking: () => void; setScreen: (screen: Screen) => void }) {
  // O servidor já entrega apenas os agendamentos deste cliente.
  const next = session ? data.appointments.find(item => item.status === "confirmed" && item.date >= dateISO()) : undefined;
  const service = data.services.find(item => item.id === next?.serviceId);
  const barber = data.barbers.find(item => item.id === next?.barberId);
  const dayLabels = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];
  const openingHours = [1, 2, 3, 4, 5, 6, 0].map(dayNumber => {
    const schedules = data.barbers.filter(item => item.active).flatMap(item => data.availability[item.id]?.filter(day => day.weekday === dayNumber && day.enabled) ?? []);
    if (!schedules.length) return { label: dayLabels[dayNumber], hours: "FECHADO", closed: true };
    const start = schedules.map(item => item.start).sort()[0];
    const end = schedules.map(item => item.end).sort().at(-1);
    return { label: dayLabels[dayNumber], hours: `${start} – ${end}`, closed: false };
  });
  return <>
    <section className="client-hero">
      <div className="hero-copy">
        <p className="hero-location"><i /> CAMPO GRANDE · RIO DE JANEIRO</p>
        <h1><span>BART</span><span>DO CORTE</span></h1>
        <p className="hero-description">Seu horário, seu barbeiro e seu próximo visual em poucos toques.</p>
        <button className="primary-action" onClick={openBooking}>AGENDAR PELO APP <Icon name="arrow-right" /></button>
      </div>
    </section>
    <Marquee />
    {next && <section className="upcoming-card">
      <div><small>PRÓXIMO HORÁRIO</small><strong>{formatDate(next.date)} · {next.time}</strong><p>{service?.name} com {barber?.name}</p></div>
      <button onClick={() => setScreen("agenda")}>VER</button>
    </section>}
    <section className="section-block">
      <SectionTitle overline="ESCOLHA O SEU" title="Próximo estilo" action="Ver agenda" onAction={() => setScreen("agenda")} />
      <div className="service-grid">{data.services.filter(item => item.active).map((item, index) => <button key={item.id} onClick={openBooking}><span>{String(index + 1).padStart(2, "0")}</span><h3>{item.name}</h3><p>{item.description}</p><b>{money.format(item.price)}</b><em>{item.duration} min</em></button>)}</div>
    </section>
    <LookbookSection openBooking={openBooking} />
    <section className="map-section" id="localizacao">
      <SectionTitle overline="ONDE ESTAMOS" title="Campo Grande · RJ" />
      <div className="map-frame">
        <iframe title="Mapa da Bart do Corte em Campo Grande, Rio de Janeiro" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=Bart%20do%20Corte%2C%20Campo%20Grande%2C%20Rio%20de%20Janeiro&output=embed" />
        <div className="map-label"><b>BART DO CORTE</b><span>Campo Grande · Rio de Janeiro</span></div>
      </div>
    </section>
    <section className="contact-section">
      <div className="contact-copy">
        <small>{"// CONTATO E LOCALIZAÇÃO"}</small>
        <h2>NOS<br /><span>ENCONTRE</span></h2>
        <dl><div><dt>REGIÃO</dt><dd>Campo Grande · Rio de Janeiro · RJ</dd></div><div><dt>ATENDIMENTO</dt><dd>Agendamento direto pelo aplicativo</dd></div></dl>
        <p>Escolha seu barbeiro, veja os horários liberados e reserve direto pelo aplicativo.</p>
      </div>
      <div className="opening-hours">
        <small>{"// HORÁRIOS"}</small>
        <p>Atualizados conforme a disponibilidade da equipe</p>
        {openingHours.map(item => <div className={`hours-row${item.closed ? " muted" : ""}`} key={item.label}><span>{item.label}</span><b>{item.hours}</b></div>)}
      </div>
    </section>
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <img src="/bart-logo.jpg" alt="" />
          <div><small>BARBEARIA</small><strong>BART DO CORTE</strong></div>
        </div>
        <div className="footer-location">
          <small>CAMPO GRANDE · RIO DE JANEIRO · RJ</small>
        </div>
        <nav className="footer-links" aria-label="Atalhos do rodapé">
          <a className="footer-instagram" href="https://www.instagram.com/barbearia_bartdocorte/" target="_blank" rel="noreferrer" aria-label="Instagram da Bart do Corte">
            <span>INSTAGRAM</span>
            <b>@BARBEARIA_BARTDOCORTE <Icon name="arrow-up-right" /></b>
          </a>
        </nav>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} BART DO CORTE</span>
        <span>AGENDAMENTO E GESTÃO EM UM SÓ LUGAR</span>
      </div>
    </footer>
  </>;
}

function LookbookSection({ openBooking }: { openBooking: () => void }) {
  return <section className="lookbook-section">
    <SectionTitle overline="REFERÊNCIAS DE CORTE" title="Inspire seu visual" />
    <div className="lookbook-grid">{haircutGallery.map(style => <button className={`look-card${style.image ? "" : " look-card--detail"}`} key={style.name} onClick={openBooking} aria-label={`Agendar ${style.name}`}>
      {style.image && <img src={style.image} alt={`Referência de ${style.name}`} loading="lazy" decoding="async" style={{ objectPosition: style.imagePosition }} />}
      <div><h3>{style.name}</h3><p>{style.detail}</p><dl className="look-card-meta"><div><dt>VALOR</dt><dd>{money.format(style.price)}</dd></div><div><dt>DURAÇÃO</dt><dd>{style.duration}</dd></div></dl><b>AGENDAR ESTE ESTILO <Icon name="arrow-right" /></b></div>
    </button>)}</div>
  </section>;
}

function BarberHome({ barberName, appointments, services, revenue }: { barberName: string; appointments: Appointment[]; services: Map<string, Service>; revenue: { today: number; month: number } }) {
  return <div className="dashboard-page">
    <PageIntro overline={`BOM TRABALHO, ${barberName.toUpperCase()}`} title="Sua rotina hoje" subtitle={`${appointments.length} horários na agenda`} />
    <div className="metric-grid"><Metric label="Produção hoje" value={money.format(revenue.today)} tone="gold" /><Metric label="Produção no mês" value={money.format(revenue.month)} /><Metric label="Agenda hoje" value={String(appointments.length)} /></div>
    <SectionTitle overline="AGENDA DE HOJE" title="Próximos clientes" />
    <div className="appointment-list">{appointments.map(item => <CompactAppointment key={item.id} item={item} service={services.get(item.serviceId)} showPhone />)}</div>
  </div>;
}

function AdminHome({ data, services, revenue, todayAppointments, setScreen }: { data: StoreData; services: Map<string, Service>; revenue: { today: number; month: number }; todayAppointments: Appointment[]; setScreen: (screen: Screen) => void }) {
  const currentMonth = dateISO().slice(0, 7);
  const monthCompleted = data.appointments.filter(item => item.status === "completed" && item.date.startsWith(`${currentMonth}-`));
  const averageTicket = monthCompleted.length ? monthCompleted.reduce((sum, item) => sum + (services.get(item.serviceId)?.price ?? 0), 0) / monthCompleted.length : 0;
  const confirmedToday = todayAppointments.filter(item => item.status === "confirmed").length;
  const completedToday = todayAppointments.filter(item => item.status === "completed").length;
  const occupancy = Math.min(100, Math.round((todayAppointments.length / 10) * 100));
  const weeklyMovement = [38, 56, 44, 72, 92, 66, 34];
  const weekdays = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
  const barberStats = data.barbers.map(barber => {
    const appointments = data.appointments.filter(item => item.barberId === barber.id && item.status === "completed");
    const produced = appointments.reduce((sum, item) => sum + (services.get(item.serviceId)?.price ?? 0), 0);
    return { ...barber, appointments: appointments.length, produced };
  });

  return <div className="dashboard-page admin-dashboard">
    <header className="admin-overview-head"><div><small>PAINEL DO PROPRIETÁRIO</small><h1>Visão geral</h1><p>Acompanhe a operação da Bart do Corte em um só lugar.</p></div></header>

    <section className="admin-kpi-grid" aria-label="Indicadores da barbearia">
      <article className="admin-kpi primary"><span>FATURAMENTO DO MÊS</span><strong>{money.format(revenue.month)}</strong><p>Somente atendimentos concluídos</p><i><Icon name="arrow-up-right" /></i></article>
      <article className="admin-kpi"><span>FATURAMENTO DE HOJE</span><strong>{money.format(revenue.today)}</strong><p>{completedToday} atendimento{completedToday === 1 ? "" : "s"} concluído{completedToday === 1 ? "" : "s"}</p><i><Icon name="wallet" /></i></article>
      <article className="admin-kpi"><span>AGENDA DE HOJE</span><strong>{todayAppointments.length}</strong><p>{confirmedToday} confirmados · {completedToday} concluídos</p><i><Icon name="calendar" /></i></article>
      <article className="admin-kpi"><span>TICKET MÉDIO DO MÊS</span><strong>{money.format(averageTicket)}</strong><p>{monthCompleted.length} atendimento{monthCompleted.length === 1 ? "" : "s"} no mês</p><i><Icon name="user" /></i></article>
    </section>

    <div className="admin-main-grid">
      <section className="admin-revenue-panel">
        <header><div><small>MOVIMENTO SEMANAL</small><h2>Ritmo da barbearia</h2></div><div className="occupancy-badge"><span>OCUPAÇÃO HOJE</span><b>{occupancy}%</b></div></header>
        <div className="admin-bar-chart">{weeklyMovement.map((height, index) => <div className="admin-bar-column" key={weekdays[index]}><span>{height}%</span><i><b style={{ height: `${height}%` }} /></i><small>{weekdays[index]}</small></div>)}</div>
        <footer><span><i className="confirmed-dot" /> Horários ocupados</span><p>Indicadores da agenda e dos atendimentos registrados.</p></footer>
      </section>

      <section className="admin-agenda-panel">
        <header><div><small>OPERAÇÃO DE HOJE</small><h2>Próximos horários</h2></div><button onClick={() => setScreen("agenda")}>VER AGENDA <Icon name="arrow-right" /></button></header>
        <div className="admin-agenda-list">{todayAppointments.length ? todayAppointments.slice(0, 5).map(item => {
          const barber = data.barbers.find(current => current.id === item.barberId);
          return <article key={item.id}><time>{item.time}</time><div><b>{item.client}</b><span>{services.get(item.serviceId)?.name} · {barber?.name}</span></div><em className={item.status}>{statusLabels[item.status]}</em></article>;
        }) : <EmptyState title="Agenda livre hoje" text="Nenhum cliente marcou horário para esta data." />}</div>
      </section>
    </div>

    <section className="admin-team-panel">
      <header><div><small>EQUIPE</small><h2>Desempenho dos barbeiros</h2></div><button onClick={() => setScreen("management")}>VER GESTÃO <Icon name="arrow-right" /></button></header>
      <div className="admin-team-grid">{barberStats.map((barber, index) => <article key={barber.id}>
        <div className="admin-barber-heading"><span>{barber.name.charAt(0)}<i>0{index + 1}</i></span><div><small>{barber.specialty}</small><h3>{barber.name}</h3></div></div>
        <div className="admin-barber-numbers"><div><span>PRODUÇÃO</span><strong>{money.format(barber.produced)}</strong></div><div><span>ATENDIMENTOS</span><strong>{barber.appointments}</strong></div></div>
      </article>)}</div>
    </section>

    <section className="admin-quick-actions"><button onClick={() => setScreen("agenda")}><span><Icon name="calendar" /></span><div><b>Agenda completa</b><small>Consultar horários da equipe</small></div><i><Icon name="arrow-right" /></i></button><button onClick={() => setScreen("management")}><span><Icon name="grid" /></span><div><b>Serviços e equipe</b><small>Configurar operação</small></div><i><Icon name="arrow-right" /></i></button></section>
  </div>;
}

/** Junta os bloqueios de 30 em 30 minutos em faixas contínuas, para exibir. */
function mergeBlocks(times: string[]) {
  const sorted = [...times].sort();
  const ranges: { start: string; end: string }[] = [];

  for (const time of sorted) {
    const start = minutes(time);
    const last = ranges.at(-1);

    if (last && minutes(last.end) === start) {
      last.end = timeLabel(start + BLOCK_SLOT_MINUTES);
      continue;
    }
    ranges.push({ start: time, end: timeLabel(start + BLOCK_SLOT_MINUTES) });
  }

  return ranges;
}

function AgendaScreen({ role, barberId, data, services, barbers, selectedDate, setSelectedDate, updateAppointment, blockRange, unblockRange }: { role: Role; barberId: string | null; data: StoreData; services: Map<string, Service>; barbers: Map<string, Barber>; selectedDate: string; setSelectedDate: (date: string) => void; updateAppointment: (id: string, status: Status, paid?: boolean) => void; blockRange: (start: string, end: string) => void; unblockRange: (start: string, end: string) => void }) {
  const dates = Array.from({ length: 7 }, (_, index) => dateISO(index));
  const [range, setRange] = useState({ start: "12:00", end: "13:00" });
  // O recorte por papel já vem do servidor; aqui só filtramos a data.
  const dayItems = data.appointments
    .filter(item => item.date === selectedDate && (role !== "barber" || item.barberId === barberId))
    .sort((a, b) => a.time.localeCompare(b.time));

  const dayBlocks = mergeBlocks(
    data.blocks.filter(item => item.date === selectedDate && (!barberId || item.barberId === barberId)).map(item => item.time),
  );
  const invalidRange = minutes(range.end) <= minutes(range.start);

  return <div className="dashboard-page agenda-page">
    <PageIntro overline={role === "client" ? "MEUS HORÁRIOS" : role === "barber" ? "MINHA AGENDA" : "AGENDA DA EQUIPE"} title="Agenda" subtitle={formatDate(selectedDate)} />
    <div className="date-strip">{dates.map(date => <button key={date} className={date === selectedDate ? "active" : ""} onClick={() => setSelectedDate(date)}><span>{weekday(date)}</span><b>{date.slice(-2)}</b></button>)}</div>

    {role === "barber" && <section className="block-panel">
      <header>
        <small>NÃO VOU ESTAR NA BARBEARIA</small>
        <p>Escolha o período em que você precisa sair. Esses horários somem para o cliente na hora de agendar.</p>
      </header>
      <div className="block-range">
        <label>DAS<input type="time" step={1800} value={range.start} onChange={event => setRange({ ...range, start: event.target.value })} /></label>
        <span>ATÉ</span>
        <label>ÀS<input type="time" step={1800} value={range.end} min={range.start} onChange={event => setRange({ ...range, end: event.target.value })} /></label>
        <button disabled={invalidRange} onClick={() => blockRange(range.start, range.end)}>BLOQUEAR</button>
      </div>
      {invalidRange && <p className="block-warning" role="alert">O horário final precisa ser depois do inicial.</p>}

      {dayBlocks.length > 0 && <div className="block-list">
        {dayBlocks.map(item => <article key={`${item.start}-${item.end}`}>
          <div><b>{item.start} às {item.end}</b><span>bloqueado</span></div>
          <button className="ghost" onClick={() => unblockRange(item.start, item.end)}>LIBERAR</button>
        </article>)}
      </div>}
    </section>}
    <div className="timeline">{dayItems.length ? dayItems.map(item => <article key={item.id} className={`timeline-item status-${item.status}`}><time>{item.time}</time><div><span className="status-pill">{statusLabels[item.status]}</span><h3>{services.get(item.serviceId)?.name}</h3><p>{role === "client" ? `com ${barbers.get(item.barberId)?.name}` : item.client}</p>{role !== "client" && <small>{item.phone} · {money.format(services.get(item.serviceId)?.price ?? 0)}</small>}{item.paid && <small className="payment-paid">{item.autoCompletedAt ? "Pago automaticamente" : "Pago"}</small>}<div className="item-actions">{item.status === "confirmed" && role !== "client" && <button onClick={() => updateAppointment(item.id, "completed", true)}>Concluir</button>}{item.status === "confirmed" && <button className="ghost" onClick={() => updateAppointment(item.id, "cancelled")}>Cancelar</button>}</div></div></article>) : <EmptyState title="Nenhum horário neste dia" text="Não há agendamentos para esta data." />}</div>
  </div>;
}

/** Foto do barbeiro, com a inicial como reserva enquanto não há imagem. */
function BarberAvatar({ barber, index, className = "barber-avatar" }: { barber: Barber; index?: number; className?: string }) {
  if (barber.photo) {
    return <div className={`${className} has-photo`}>
      <img src={barber.photo} alt={`Foto de ${barber.name}`} loading="lazy" />
      {typeof index === "number" && <span>0{index + 1}</span>}
    </div>;
  }

  return <div className={className}>
    {barber.name.slice(0, 1)}
    {typeof index === "number" && <span>0{index + 1}</span>}
  </div>;
}

function TeamScreen({ data, openBooking }: { data: StoreData; openBooking: () => void }) {
  return <div className="dashboard-page">
    <PageIntro overline="NOSSA EQUIPE" title="Escolha seu barbeiro" subtitle="Profissionais da Bart do Corte" />
    <div className="team-grid">{data.barbers.filter(item => item.active).map((item, index) => <article key={item.id}>
      <BarberAvatar barber={item} index={index} />
      <small>BARBEIRO</small>
      <h3>{item.name}</h3>
      <p>{item.specialty}</p>
      <button onClick={openBooking}>VER HORÁRIOS <Icon name="arrow-right" /></button>
    </article>)}</div>
  </div>;
}

function AvailabilityScreen({ barberName, days, updateDay }: { barberName: string; days: WorkDay[]; updateDay: (weekdayNumber: number, changes: Partial<WorkDay>) => void }) {
  const labels = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  return <div className="dashboard-page availability-page">
    <PageIntro overline={`DISPONIBILIDADE DE ${barberName.toUpperCase()}`} title="Meus horários" subtitle="Somente estes dias e faixas aparecerão para os clientes" />
    <div className="availability-notice"><Icon name="calendar" /><div><b>Você controla sua agenda</b><p>Dia fechado fica cinza no agendamento e não recebe novos horários.</p></div></div>
    <div className="availability-list">{[...days].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)).map(day => <article key={day.weekday} className={day.enabled ? "enabled" : ""}>
      <div className="availability-day"><button className={day.enabled ? "schedule-toggle active" : "schedule-toggle"} onClick={() => updateDay(day.weekday, { enabled: !day.enabled })} aria-label={`${day.enabled ? "Fechar" : "Abrir"} ${labels[day.weekday]}`}><i /></button><div><b>{labels[day.weekday]}</b><span>{day.enabled ? "Disponível para agendamentos" : "Indisponível"}</span></div></div>
      <div className="availability-hours"><label>ENTRADA<input type="time" value={day.start} disabled={!day.enabled} onChange={event => updateDay(day.weekday, { start: event.target.value })} /></label><span>ATÉ</span><label>SAÍDA<input type="time" value={day.end} disabled={!day.enabled} min={day.start} onChange={event => updateDay(day.weekday, { end: event.target.value })} /></label></div>
    </article>)}</div>
  </div>;
}

function EarningsScreen({ appointments, services, revenue }: { appointments: Appointment[]; services: Map<string, Service>; revenue: number }) {
  const monthAppointments = appointments.filter(item => item.date.startsWith(`${dateISO().slice(0, 7)}-`));
  const ticket = monthAppointments.length ? revenue / monthAppointments.length : 0;

  // Mais recente primeiro: é o que "últimos atendimentos" promete no título.
  const recent = [...appointments].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));

  return <div className="dashboard-page">
    <PageIntro overline="TRANSPARÊNCIA" title="Minha produção" subtitle="O que você atendeu neste mês" />
    <div className="earnings-hero"><small>PRODUÇÃO DO MÊS</small><strong>{money.format(revenue)}</strong><p>{monthAppointments.length} atendimento{monthAppointments.length === 1 ? "" : "s"} concluído{monthAppointments.length === 1 ? "" : "s"}</p></div>
    <div className="financial-list">
      <div><span>Atendimentos no mês</span><b>{monthAppointments.length}</b></div>
      <div><span>Ticket médio</span><b>{money.format(ticket)}</b></div>
      <div><span>Atendimentos no total</span><b>{appointments.length}</b></div>
    </div>
    <SectionTitle overline="HISTÓRICO" title="Últimos atendimentos" />
    <div className="appointment-list">{recent.map(item => <CompactAppointment key={item.id} item={item} service={services.get(item.serviceId)} showPhone />)}</div>
  </div>;
}

/** Linha de serviço que abre para edição de nome, preço e duração. */
function ServiceRow({ item, run }: { item: Service; run: (action: () => Promise<unknown>, successMessage?: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: item.name, price: String(item.price), duration: String(item.duration) });

  function open() {
    setDraft({ name: item.name, price: String(item.price), duration: String(item.duration) });
    setEditing(true);
  }

  async function save() {
    const price = Number(draft.price.replace(",", "."));
    const duration = Number(draft.duration);

    if (!draft.name.trim() || !Number.isFinite(price) || price < 0 || !Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const ok = await run(
      () => api.updateService(item.id, { name: draft.name.trim(), price, duration }),
      "Serviço atualizado",
    );
    if (ok) setEditing(false);
  }

  if (!editing) {
    return <article>
      <div><b>{item.name}</b><span>{item.duration} min · {money.format(item.price)}</span></div>
      <div className="manage-actions">
        <button className="link-action" onClick={open}>EDITAR</button>
        <button className={item.active ? "toggle active" : "toggle"} aria-label={`Ativar ou desativar ${item.name}`} onClick={() => run(() => api.updateService(item.id, { active: !item.active }))}><i /></button>
      </div>
    </article>;
  }

  return <article className="editing">
    <div className="edit-fields">
      <label>NOME<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <div>
        <label>PREÇO<input inputMode="decimal" value={draft.price} onChange={event => setDraft({ ...draft, price: event.target.value })} /></label>
        <label>MINUTOS<input inputMode="numeric" value={draft.duration} onChange={event => setDraft({ ...draft, duration: event.target.value })} /></label>
      </div>
      <div className="edit-actions">
        <button onClick={save}>SALVAR</button>
        <button className="ghost" onClick={() => setEditing(false)}>CANCELAR</button>
      </div>
    </div>
  </article>;
}

/** Linha de barbeiro, com renomear para corrigir cadastro errado. */
function BarberRow({ item, run }: { item: Barber; run: (action: () => Promise<unknown>, successMessage?: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: item.name, specialty: item.specialty, notifyPhone: item.notifyPhone });

  async function save() {
    if (draft.name.trim().length < 2) return;
    const ok = await run(
      () => api.updateBarber(item.id, {
        name: draft.name.trim(),
        specialty: draft.specialty.trim(),
        notifyPhone: draft.notifyPhone.trim(),
      }),
      "Barbeiro atualizado",
    );
    if (ok) setEditing(false);
  }

  if (!editing) {
    return <article>
      <div><b>{item.name}</b><span>{item.notifyPhone ? `Avisa em ${item.notifyPhone}` : item.specialty || "Sem especialidade"}</span></div>
      <div className="manage-actions">
        <button className="link-action" onClick={() => { setDraft({ name: item.name, specialty: item.specialty, notifyPhone: item.notifyPhone }); setEditing(true); }}>EDITAR</button>
        <button className={item.active ? "toggle active" : "toggle"} aria-label={`Ativar ou desativar ${item.name}`} onClick={() => run(() => api.updateBarber(item.id, { active: !item.active }), item.active ? "Barbeiro desativado" : "Barbeiro reativado")}><i /></button>
      </div>
    </article>;
  }

  return <article className="editing">
    <div className="edit-fields">
      <label>NOME<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>ESPECIALIDADE<input value={draft.specialty} onChange={event => setDraft({ ...draft, specialty: event.target.value })} placeholder="Ex.: Fade e navalhado" /></label>
      <label>WHATSAPP PARA AVISOS<input inputMode="tel" value={draft.notifyPhone} onChange={event => setDraft({ ...draft, notifyPhone: event.target.value })} placeholder="(21) 99999-9999" /></label>
      <div className="edit-actions">
        <button onClick={save}>SALVAR</button>
        <button className="ghost" onClick={() => setEditing(false)}>CANCELAR</button>
      </div>
    </div>
  </article>;
}

function ManagementScreen({ data, run, newService, setNewService, addService }: { data: StoreData; run: (action: () => Promise<unknown>, successMessage?: string) => Promise<boolean>; newService: { name: string; price: string; duration: string }; setNewService: (value: { name: string; price: string; duration: string }) => void; addService: () => void }) {
  const [newBarber, setNewBarber] = useState({ name: "", specialty: "" });

  async function addBarber() {
    if (newBarber.name.trim().length < 2) return;
    const ok = await run(
      () => api.addBarber(newBarber.name.trim(), newBarber.specialty.trim()),
      "Barbeiro cadastrado",
    );
    if (ok) setNewBarber({ name: "", specialty: "" });
  }

  return <div className="dashboard-page">
    <PageIntro overline="CONFIGURAÇÃO" title="Gestão" subtitle="Serviços e equipe da barbearia" />

    <SectionTitle overline="CATÁLOGO" title="Serviços" />
    <div className="manage-list">{data.services.map(item => <ServiceRow key={item.id} item={item} run={run} />)}</div>

    <div className="add-form">
      <small>NOVO SERVIÇO</small>
      <input placeholder="Nome" value={newService.name} onChange={event => setNewService({ ...newService, name: event.target.value })} />
      <div>
        <input inputMode="decimal" placeholder="Preço" value={newService.price} onChange={event => setNewService({ ...newService, price: event.target.value })} />
        <input inputMode="numeric" placeholder="Minutos" value={newService.duration} onChange={event => setNewService({ ...newService, duration: event.target.value })} />
      </div>
      <button onClick={addService}>CADASTRAR SERVIÇO</button>
    </div>

    <SectionTitle overline="EQUIPE" title="Barbeiros" />
    <div className="manage-list">{data.barbers.map(item => <BarberRow key={item.id} item={item} run={run} />)}</div>

    <div className="add-form">
      <small>NOVO BARBEIRO</small>
      <input placeholder="Nome" value={newBarber.name} onChange={event => setNewBarber({ ...newBarber, name: event.target.value })} />
      <input placeholder="Especialidade (opcional)" value={newBarber.specialty} onChange={event => setNewBarber({ ...newBarber, specialty: event.target.value })} />
      <button onClick={addBarber}>CADASTRAR BARBEIRO</button>
      <p className="add-form-hint">Ele nasce com a semana fechada. Crie o acesso dele em <b>Acessos</b> e peça para marcar os dias em que atende.</p>
    </div>

    <div className="danger-zone">
      <small>DADOS DE DEMONSTRAÇÃO</small>
      <p>Remove os cinco agendamentos de exemplo criados na instalação. Os atendimentos reais não são afetados.</p>
      <button onClick={() => run(() => api.updateSettings({ clearDemo: true }), "Dados de demonstração removidos")}>LIMPAR DEMONSTRAÇÃO</button>
    </div>
  </div>;
}

function deviceLabel(userAgent: string) {
  if (/iPhone|iPad/i.test(userAgent)) return "iPhone / iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac OS/i.test(userAgent)) return "Mac";
  return "Aparelho desconhecido";
}

function whenLabel(value: string | null) {
  if (!value) return "nunca";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

/**
 * Acessos da barbearia. É a tela que tira a dependência do desenvolvedor:
 * o proprietário cria, redefine e desativa acesso sozinho.
 */
function SecurityScreen({ setToast }: { setToast: (message: string) => void }) {
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [teamBarbers, setTeamBarbers] = useState<{ id: string; name: string }[]>([]);
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [clientCount, setClientCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ username: "", barberId: "" });
  const [revealed, setRevealed] = useState<{ username: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [accountData, deviceData] = await Promise.all([api.accounts(), api.devices()]);
      setAccounts(accountData.accounts);
      setTeamBarbers(accountData.barbers.map(item => ({ id: item.id, name: item.name })));
      setDevices(deviceData.sessions);
      setClientCount(deviceData.clientCount);
    } catch (error) {
      setToast(error instanceof ApiError ? error.message : "Não foi possível carregar os acessos.");
    } finally {
      setLoading(false);
    }
  }, [setToast]);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- carrega os acessos do servidor ao abrir a tela */
  useEffect(() => { void load(); }, [load]);

  async function act(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      await load();
      setToast(message);
    } catch (error) {
      setToast(error instanceof ApiError ? error.message : "Não foi possível concluir a ação.");
    }
  }

  const withoutAccount = teamBarbers.filter(barber => !accounts.some(account => account.barberId === barber.id));

  return <div className="dashboard-page">
    <PageIntro overline="SEGURANÇA" title="Acessos" subtitle="Quem entra no sistema da barbearia" />

    {revealed && <div className="secret-card" role="alert">
      <small>SENHA PROVISÓRIA DE {revealed.username.toUpperCase()}</small>
      <strong>{revealed.password}</strong>
      <p>Anote agora: ela aparece uma única vez. No primeiro acesso o barbeiro é obrigado a trocar por uma senha só dele.</p>
      <button onClick={() => setRevealed(null)}>JÁ ANOTEI</button>
    </div>}

    {loading ? <EmptyState title="Carregando acessos" text="Buscando as informações no servidor." /> : <>
      <SectionTitle overline="CONTAS" title="Quem tem acesso" />
      <div className="account-list">{accounts.map(account => <article key={account.id} className={account.active ? "" : "inactive"}>
        <div className="account-heading">
          <span>{account.displayName.charAt(0).toUpperCase()}</span>
          <div>
            <b>{account.displayName}</b>
            <small>{account.username} · {account.role === "admin" ? "Proprietário" : "Barbeiro"}</small>
          </div>
          <em className={account.active ? "on" : "off"}>{account.active ? "ATIVO" : "DESATIVADO"}</em>
        </div>
        <p className="account-meta">
          Último acesso: {whenLabel(account.lastLoginAt)}
          {account.mustChangePassword && <b> · senha provisória pendente</b>}
        </p>
        <div className="account-actions">
          <button onClick={() => act(async () => {
            const result = await api.updateAccount(account.id, "reset");
            if (result.temporaryPassword) setRevealed({ username: account.username, password: result.temporaryPassword });
          }, "Senha redefinida")}>REDEFINIR SENHA</button>
          {account.role !== "admin" && (account.active
            ? <button className="ghost" onClick={() => act(() => api.updateAccount(account.id, "deactivate"), "Acesso desativado")}>DESATIVAR</button>
            : <button className="ghost" onClick={() => act(() => api.updateAccount(account.id, "activate"), "Acesso reativado")}>REATIVAR</button>)}
        </div>
      </article>)}</div>

      {withoutAccount.length > 0 && <div className="add-form">
        <small>CRIAR ACESSO DE BARBEIRO</small>
        <input placeholder="Nome de acesso" value={draft.username} onChange={event => setDraft({ ...draft, username: event.target.value })} />
        <select value={draft.barberId} onChange={event => setDraft({ ...draft, barberId: event.target.value })}>
          <option value="">Escolha o barbeiro</option>
          {withoutAccount.map(barber => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
        </select>
        <button disabled={!draft.username || !draft.barberId} onClick={() => act(async () => {
          const result = await api.createAccount(draft.username, draft.barberId);
          setRevealed({ username: result.username, password: result.temporaryPassword });
          setDraft({ username: "", barberId: "" });
        }, "Acesso criado")}>CRIAR ACESSO</button>
      </div>}

      <SectionTitle overline="APARELHOS" title="Aparelhos da equipe" />
      <div className="device-list">{devices.length ? devices.map(device => <article key={device.id}>
        <div>
          <b>{device.displayName}</b>
          <small>{deviceLabel(device.userAgent)} · {device.role === "admin" ? "Proprietário" : device.role === "barber" ? "Barbeiro" : "Cliente"}</small>
          <small>Visto por último em {whenLabel(device.lastSeenAt)}</small>
        </div>
        {device.current
          ? <em>ESTE APARELHO</em>
          : <button className="ghost" onClick={() => act(() => api.revokeDevice(device.id), "Aparelho desconectado")}>ENCERRAR</button>}
      </article>) : <EmptyState title="Nenhum aparelho conectado" text="Os acessos da equipe aparecem aqui." />}</div>
      <p className="device-note">O login não expira: a equipe e os clientes seguem conectados até sair pelo botão, limpar os dados do navegador ou ter o acesso encerrado aqui.{clientCount > 0 && ` Hoje há ${clientCount} aparelho${clientCount === 1 ? "" : "s"} de cliente conectado${clientCount === 1 ? "" : "s"}.`}</p>
    </>}
  </div>;
}

/** O barbeiro envia a própria foto, que passa a aparecer na tela de Equipe. */
function BarberPhotoCard({ barber, run }: { barber: Barber; run: (action: () => Promise<unknown>, successMessage?: string) => Promise<boolean>; }) {
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const inputId = "barber-photo-input";

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    setWorking(true);

    try {
      const photo = await prepareBarberPhoto(file);
      await run(() => api.updateBarber(barber.id, { photo }), "Foto atualizada");
    } catch (problem) {
      setError(problem instanceof PhotoError ? problem.message : "Não foi possível usar esta imagem.");
    } finally {
      setWorking(false);
    }
  }

  return <section className="photo-card">
    <small>SUA FOTO</small>
    <div className="photo-card-body">
      <BarberAvatar barber={barber} className="photo-preview" />
      <div>
        <p>Ela aparece para o cliente na tela <b>Equipe</b> e na hora de escolher com quem cortar.</p>
        <div className="photo-actions">
          <label className="photo-pick" htmlFor={inputId}>{working ? "PROCESSANDO…" : barber.photo ? "TROCAR FOTO" : "ENVIAR FOTO"}</label>
          <input
            id={inputId}
            type="file"
            accept={ACCEPTED_PHOTO_TYPES.join(",")}
            disabled={working}
            onChange={event => {
              void pick(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {barber.photo && <button className="photo-remove" disabled={working} onClick={() => run(() => api.updateBarber(barber.id, { photo: "" }), "Foto removida")}>REMOVER</button>}
        </div>
        {error && <p className="photo-error" role="alert">{error}</p>}
      </div>
    </div>
  </section>;
}

/**
 * WhatsApp que recebe os agendamentos deste barbeiro.
 *
 * Fica no perfil dele porque o número é dele: quem troca de celular é o
 * barbeiro, não o proprietário.
 */
function BarberNotifyCard({ barber, whatsappReady, run }: { barber: Barber; whatsappReady: boolean; run: (action: () => Promise<unknown>, successMessage?: string) => Promise<boolean> }) {
  const [phone, setPhone] = useState(barber.notifyPhone);
  const mudou = phone.trim() !== barber.notifyPhone;

  return <section className="photo-card">
    <small>SEU WHATSAPP PARA AVISOS</small>
    <div className="notify-card-body">
      <p>
        Você recebe uma mensagem assim que um cliente marcar ou cancelar um horário
        <b> com você</b>. Os agendamentos dos outros barbeiros não chegam aqui.
      </p>

      {!whatsappReady && <p className="notify-card-warning">
        O envio ainda não foi ligado pela barbearia. Pode deixar seu número salvo:
        as mensagens começam a chegar assim que for ativado.
      </p>}

      <label htmlFor="barber-notify-phone">NÚMERO COM DDD</label>
      <input
        id="barber-notify-phone"
        inputMode="tel"
        value={phone}
        onChange={event => setPhone(event.target.value)}
        placeholder="(21) 99999-9999"
      />

      <div className="notify-card-actions">
        <button disabled={!mudou} onClick={() => run(() => api.updateBarber(barber.id, { notifyPhone: phone.trim() }), phone.trim() ? "Número salvo" : "Avisos desligados")}>
          {phone.trim() ? "SALVAR NÚMERO" : "PARAR DE RECEBER"}
        </button>
        {barber.notifyPhone && <span className="notify-card-status">Recebendo em {barber.notifyPhone}</span>}
      </div>
    </div>
  </section>;
}

function ProfileScreen({ session, barber, whatsappReady, run, logout }: { session: Session; barber: Barber | null; whatsappReady: boolean; run: (action: () => Promise<unknown>, successMessage?: string) => Promise<boolean>; logout: () => void }) {
  const initials = session.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

  return <div className="dashboard-page">
    <PageIntro overline="MINHA CONTA" title="Perfil e acesso" subtitle="Dados do seu perfil" />
    <div className="profile-card">
      {barber?.photo ? <div className="large-avatar has-photo"><img src={barber.photo} alt={`Foto de ${barber.name}`} /></div> : <div className="large-avatar">{initials}</div>}
      <small>ACESSO ATUAL</small>
      <h2>{roleLabels[session.role]}</h2>
      <p>{session.name}</p>
      {session.role === "client" && <span>{session.phone}</span>}
    </div>
    {barber && <BarberPhotoCard barber={barber} run={run} />}
    {barber && <BarberNotifyCard barber={barber} whatsappReady={whatsappReady} run={run} />}
    <button className="logout-button" onClick={logout}>SAIR DESTE ACESSO <Icon name="arrow-right" /></button>
  </div>;
}

function BookingSheet({ step, setStep, booking, setBooking, data, timeSlots, bookedEvent, close, confirm }: { step: number; setStep: (step: number) => void; booking: { serviceId: string; barberId: string; date: string; time: string }; setBooking: (value: { serviceId: string; barberId: string; date: string; time: string }) => void; data: StoreData; timeSlots: { time: string; available: boolean }[]; bookedEvent: CalendarEvent | null; close: () => void; confirm: () => void }) {
  const dates = Array.from({ length: 10 }, (_, index) => dateISO(index + 1));
  const service = data.services.find(item => item.id === booking.serviceId);
  const barber = data.barbers.find(item => item.id === booking.barberId);
  const dayIsAvailable = (date: string) => {
    const day = new Date(`${date}T12:00:00`).getDay();
    return Boolean(data.availability[booking.barberId]?.find(item => item.weekday === day)?.enabled);
  };
  const hasAvailableTime = timeSlots.some(slot => slot.available);
  return <div className="sheet-backdrop"><section className="booking-sheet"><header><div><small>NOVO AGENDAMENTO</small><b>{step > 4 ? "Confirmado" : `Etapa ${step} de 4`}</b></div><button onClick={close} aria-label="Fechar"><Icon name="close" /></button></header><div className="steps"><i className={step >= 1 ? "done" : ""} /><i className={step >= 2 ? "done" : ""} /><i className={step >= 3 ? "done" : ""} /><i className={step >= 4 ? "done" : ""} /></div>{step === 1 && <div className="sheet-content"><h2>Qual serviço?</h2><div className="choice-list">{data.services.filter(item => item.active).map(item => <button key={item.id} onClick={() => { setBooking({ ...booking, serviceId: item.id }); setStep(2); }}><div><b>{item.name}</b><span>{item.description} · {item.duration} min</span></div><strong>{money.format(item.price)}</strong></button>)}</div></div>}{step === 2 && <div className="sheet-content"><button className="back-link" onClick={() => setStep(1)}><Icon name="arrow-left" />Voltar</button><h2>Com quem?</h2><div className="choice-list barber-choices">{data.barbers.filter(item => item.active).map(item => <button key={item.id} onClick={() => { setBooking({ ...booking, barberId: item.id, date: "", time: "" }); setStep(3); }}><i>{item.photo ? <img src={item.photo} alt="" /> : item.name[0]}</i><div><b>{item.name}</b><span>{item.specialty}</span></div><strong><Icon name="arrow-right" /></strong></button>)}</div></div>}{step === 3 && <div className="sheet-content"><button className="back-link" onClick={() => setStep(2)}><Icon name="arrow-left" />Voltar</button><h2>Escolha o dia</h2><p className="availability-hint">Dias em cinza não foram liberados por {barber?.name}.</p><div className="booking-dates">{dates.map(date => { const available = dayIsAvailable(date); return <button key={date} disabled={!available} className={`${booking.date === date ? "active" : ""} ${available ? "" : "unavailable"}`} onClick={() => { setBooking({ ...booking, date, time: "" }); setStep(4); }}><span>{weekday(date)}</span><b>{date.slice(-2)}</b><small>{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</small></button>; })}</div></div>}{step === 4 && <div className="sheet-content"><button className="back-link" onClick={() => setStep(3)}><Icon name="arrow-left" />Voltar</button><h2>Melhor horário</h2><p className="booking-summary">{service?.name} com {barber?.name} · {formatDate(booking.date)}</p><p className="availability-hint">Horários em cinza já foram reservados.</p><div className="time-grid">{timeSlots.map(slot => <button key={slot.time} disabled={!slot.available} className={`${booking.time === slot.time ? "active" : ""} ${slot.available ? "" : "unavailable"}`} onClick={() => setBooking({ ...booking, time: slot.time })}>{slot.time}</button>)}</div>{!hasAvailableTime && <EmptyState title="Sem horários livres" text="Escolha outra data para continuar." />}<button className="confirm-button" disabled={!booking.time} onClick={confirm}>CONFIRMAR AGENDAMENTO <Icon name="arrow-right" /></button></div>}{step === 5 && bookedEvent && <div className="sheet-content booking-done"><div className="done-badge"><Icon name="check" /></div><h2>Horário confirmado</h2><p className="booking-summary">{bookedEvent.serviceName} com {bookedEvent.barberName}<br />{formatDate(bookedEvent.date)} às {bookedEvent.time}</p><button className="calendar-button" onClick={() => saveToCalendar(bookedEvent)}><span><Icon name="calendar" /></span><div><b>Adicionar ao calendário</b><small>Salva no celular com lembrete 1 hora antes</small></div><i><Icon name="download" /></i></button><button className="confirm-button ghost" onClick={close}>VER MEUS HORÁRIOS <Icon name="arrow-right" /></button></div>}</section></div>;
}

function BottomNav({ items, screen, onNavigate }: { items: [string, IconName, string][]; screen: Screen; onNavigate: (target: string) => void }) {
  return <nav className="bottom-nav" aria-label="Navegação principal" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>{items.map(([target, icon, label]) => <button key={target} className={`${target === "plus" ? "nav-plus" : ""} ${screen === target ? "active" : ""}`} onClick={() => onNavigate(target)}><span><Icon name={icon} /></span>{target !== "plus" && label}</button>)}</nav>;
}

function SectionTitle({ title, action, onAction }: { overline: string; title: string; action?: string; onAction?: () => void }) { return <div className="section-heading"><h2>{title}</h2>{action && <button onClick={onAction}>{action}</button>}</div>; }
function PageIntro({ title, subtitle }: { overline: string; title: string; subtitle: string }) { return <div className="page-intro"><h1>{title}</h1><p>{subtitle}</p></div>; }
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) { return <article className={`metric ${tone ?? ""}`}><span>{label}</span><b>{value}</b></article>; }
function CompactAppointment({ item, service, barber, showPhone = false }: { item: Appointment; service?: Service; barber?: string; showPhone?: boolean }) { return <article className="compact-appointment"><time>{item.time}</time><div><b>{service?.name}</b><span>{barber || (showPhone ? `${item.client} · ${item.phone}` : item.client)}</span>{item.paid && <small className="payment-paid">{item.autoCompletedAt ? "Pago automaticamente" : "Pago"}</small>}</div><strong className={`dot ${item.status}`} aria-label={`${statusLabels[item.status]}${item.paid ? ", pago" : ""}`} /></article>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><span><Icon name="scissors" /></span><b>{title}</b><p>{text}</p></div>; }
