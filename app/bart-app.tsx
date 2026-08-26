"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Role = "client" | "barber" | "admin";
type Screen = "home" | "agenda" | "team" | "management" | "profile";
type Status = "confirmed" | "completed" | "cancelled" | "noshow";
type IconName = "home" | "calendar" | "plus" | "scissors" | "user" | "grid" | "wallet" | "arrow-right" | "arrow-left" | "arrow-up-right" | "check" | "close" | "download" | "upload";

const iconPaths: Record<IconName, React.ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 21v-6h6v6" /></>, calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>, plus: <path d="M12 5v14M5 12h14" />, scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="m8.6 7.5 10.4 9M8.6 16.5 19 7.5" /></>, user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6" /></>, grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>, wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a1 1 0 0 1 1 1v2H6.5A2.5 2.5 0 0 0 4 10.5v7A2.5 2.5 0 0 0 6.5 20H20v-3" /><path d="M20 10h-5a2 2 0 0 0 0 4h5z" /></>, "arrow-right": <path d="M5 12h14m-6-6 6 6-6 6" />, "arrow-left": <path d="M19 12H5m6 6-6-6 6-6" />, "arrow-up-right": <path d="M7 17 17 7m-7 0h7v7" />, check: <path d="m5 12 4.5 4.5L19 7" />, close: <path d="m6 6 12 12M18 6 6 18" />, download: <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />, upload: <path d="M12 21V9m0 0 4 4m-4-4-4 4M5 3h14" />,
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
  commission: number;
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
};

type StoreData = {
  services: Service[];
  barbers: Barber[];
  appointments: Appointment[];
  blocks: { id: string; barberId: string; date: string; time: string }[];
  shopName: string;
  neighborhood: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const STORAGE_KEY = "bartdocorte-mvp-v1";

function dateISO(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

const initialData = (): StoreData => ({
  shopName: "Bart do Corte",
  neighborhood: "Campo Grande · RJ",
  services: [
    { id: "cut", name: "Corte", description: "Clássico, social ou fade", price: 35, duration: 40, active: true },
    { id: "beard", name: "Barba", description: "Contorno e acabamento", price: 25, duration: 30, active: true },
    { id: "combo", name: "Corte + barba", description: "Experiência completa", price: 55, duration: 60, active: true },
    { id: "kids", name: "Corte infantil", description: "Para os pequenos", price: 30, duration: 35, active: true },
  ],
  barbers: [
    { id: "anderson", name: "Anderson", specialty: "Fade e navalhado", commission: 50, active: true },
    { id: "bart", name: "Bart", specialty: "Clássicos e barba", commission: 50, active: true },
  ],
  appointments: [
    { id: "a1", client: "Cliente 01", phone: "(21) 9XXXX-0001", serviceId: "combo", barberId: "anderson", date: dateISO(), time: "09:00", status: "completed", paid: true, paymentMethod: "Pix" },
    { id: "a2", client: "Cliente 02", phone: "(21) 9XXXX-0002", serviceId: "cut", barberId: "anderson", date: dateISO(), time: "11:00", status: "confirmed", paid: false },
    { id: "a3", client: "Cliente 03", phone: "(21) 9XXXX-0003", serviceId: "beard", barberId: "bart", date: dateISO(), time: "13:30", status: "confirmed", paid: false },
    { id: "a4", client: "Cliente 04", phone: "(21) 9XXXX-0004", serviceId: "cut", barberId: "anderson", date: dateISO(1), time: "15:00", status: "confirmed", paid: false },
    { id: "a5", client: "Cliente 05", phone: "(21) 9XXXX-0005", serviceId: "combo", barberId: "bart", date: dateISO(-1), time: "17:00", status: "completed", paid: true, paymentMethod: "Débito" },
  ],
  blocks: [],
});

const roleLabels: Record<Role, string> = { client: "Cliente", barber: "Barbeiro", admin: "Proprietário" };
const statusLabels: Record<Status, string> = { confirmed: "Confirmado", completed: "Concluído", cancelled: "Cancelado", noshow: "Faltou" };

function minutes(value: string) {
  const [hour, min] = value.split(":").map(Number);
  return hour * 60 + min;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`));
}

function weekday(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(new Date(`${value}T12:00:00`)).replace(".", "");
}

export default function BartApp() {
  const [data, setData] = useState<StoreData>(initialData);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role>("client");
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedDate, setSelectedDate] = useState(dateISO());
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  const [booking, setBooking] = useState({ serviceId: "", barberId: "", date: dateISO(1), time: "" });
  const [toast, setToast] = useState("");
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [newService, setNewService] = useState({ name: "", price: "", duration: "" });

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const savedRole = window.localStorage.getItem(`${STORAGE_KEY}-role`) as Role | null;
      if (saved) setData(JSON.parse(saved));
      if (savedRole && ["client", "barber", "admin"].includes(savedRole)) setRole(savedRole);
    } catch { /* mantém os dados de demonstração */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    window.localStorage.setItem(`${STORAGE_KEY}-role`, role);
  }, [data, role, ready]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const services = useMemo(() => new Map(data.services.map(item => [item.id, item])), [data.services]);
  const barbers = useMemo(() => new Map(data.barbers.map(item => [item.id, item])), [data.barbers]);
  const completed = data.appointments.filter(item => item.status === "completed");
  const revenue = completed.reduce((sum, item) => sum + (services.get(item.serviceId)?.price ?? 0), 0);
  const barberRevenue = completed.filter(item => item.barberId === "anderson").reduce((sum, item) => sum + (services.get(item.serviceId)?.price ?? 0), 0);
  const barberCommission = barberRevenue * ((barbers.get("anderson")?.commission ?? 0) / 100);
  const todayAppointments = data.appointments.filter(item => item.date === dateISO() && item.status !== "cancelled");

  const availableTimes = useMemo(() => {
    const result: string[] = [];
    const duration = services.get(booking.serviceId)?.duration ?? 30;
    for (let value = 9 * 60; value <= 18 * 60; value += 30) {
      const time = `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
      const conflict = data.appointments.some(item => {
        if (item.date !== booking.date || item.barberId !== booking.barberId || item.status === "cancelled") return false;
        const currentDuration = services.get(item.serviceId)?.duration ?? 30;
        return value < minutes(item.time) + currentDuration && value + duration > minutes(item.time);
      });
      const blocked = data.blocks.some(item => item.date === booking.date && item.barberId === booking.barberId && item.time === time);
      if (!conflict && !blocked) result.push(time);
    }
    return result;
  }, [booking, data.appointments, data.blocks, services]);

  const navItems: [string, IconName, string][] = role === "client"
    ? [["home", "home", "Início"], ["agenda", "calendar", "Agendamentos"], ["plus", "plus", "Agendar"], ["team", "scissors", "Equipe"], ["profile", "user", "Perfil"]]
    : role === "barber"
      ? [["home", "home", "Resumo"], ["agenda", "calendar", "Agenda"], ["plus", "plus", "Encaixe"], ["management", "wallet", "Ganhos"], ["profile", "user", "Perfil"]]
      : [["home", "grid", "Visão geral"], ["agenda", "calendar", "Agenda"], ["plus", "plus", "Agendar"], ["management", "grid", "Gestão"], ["profile", "user", "Perfil"]];

  function selectRole(nextRole: Role) {
    setRole(nextRole);
    setScreen("home");
    setShowRoleMenu(false);
    setToast(`Modo ${roleLabels[nextRole]} ativado`);
  }

  function openBooking() {
    setBooking({ serviceId: "", barberId: "", date: dateISO(1), time: "" });
    setBookingStep(1);
    setBookingOpen(true);
  }

  function confirmBooking() {
    const appointment: Appointment = {
      id: `a-${Date.now()}`,
      client: role === "client" ? "Cliente Demo" : "Cliente balcão",
      phone: "(21) 9XXXX-0000",
      serviceId: booking.serviceId,
      barberId: booking.barberId,
      date: booking.date,
      time: booking.time,
      status: "confirmed",
      paid: false,
    };
    setData(current => ({ ...current, appointments: [...current.appointments, appointment] }));
    setBookingOpen(false);
    setScreen("agenda");
    setSelectedDate(booking.date);
    setToast("Horário reservado com sucesso");
  }

  function updateAppointment(id: string, status: Status, paid?: boolean) {
    setData(current => ({
      ...current,
      appointments: current.appointments.map(item => item.id === id ? { ...item, status, paid: paid ?? item.paid, paymentMethod: paid ? "Pix" : item.paymentMethod } : item),
    }));
    setToast(status === "completed" ? "Atendimento concluído" : "Agendamento atualizado");
  }

  function toggleBlock(time: string) {
    const existing = data.blocks.find(item => item.barberId === "anderson" && item.date === selectedDate && item.time === time);
    setData(current => ({
      ...current,
      blocks: existing ? current.blocks.filter(item => item.id !== existing.id) : [...current.blocks, { id: `b-${Date.now()}`, barberId: "anderson", date: selectedDate, time }],
    }));
    setToast(existing ? "Horário liberado" : "Horário bloqueado");
  }

  function addService() {
    if (!newService.name || !newService.price || !newService.duration) return;
    setData(current => ({
      ...current,
      services: [...current.services, { id: `s-${Date.now()}`, name: newService.name, description: "Novo serviço", price: Number(newService.price), duration: Number(newService.duration), active: true }],
    }));
    setNewService({ name: "", price: "", duration: "" });
    setToast("Serviço cadastrado");
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bart-do-corte-backup-${dateISO()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("Backup exportado");
  }

  function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setData(JSON.parse(String(reader.result)));
        setToast("Backup restaurado");
      } catch { setToast("Arquivo de backup inválido"); }
    };
    reader.readAsText(file);
  }

  function resetData() {
    if (!window.confirm("Restaurar os dados de demonstração?")) return;
    setData(initialData());
    setToast("Dados de demonstração restaurados");
  }

  return (
    <main className="app-shell">
      <section className="app-frame">
        <Header role={role} items={navItems} screen={screen} onNavigate={(target) => target === "plus" ? openBooking() : setScreen(target as Screen)} onOpen={() => setShowRoleMenu(value => !value)} />
        {showRoleMenu && (
          <div className="role-popover">
            <small>VISUALIZAR COMO</small>
            {(["client", "barber", "admin"] as Role[]).map(item => (
              <button key={item} className={role === item ? "selected" : ""} onClick={() => selectRole(item)}>{roleLabels[item]}<Icon name="arrow-right" /></button>
            ))}
          </div>
        )}

        <div className="app-content">
          {screen === "home" && role === "client" && <ClientHome data={data} openBooking={openBooking} setScreen={setScreen} />}
          {screen === "home" && role === "barber" && <BarberHome appointments={todayAppointments.filter(item => item.barberId === "anderson")} services={services} revenue={barberRevenue} commission={barberCommission} />}
          {screen === "home" && role === "admin" && <AdminHome data={data} services={services} revenue={revenue} todayAppointments={todayAppointments} setScreen={setScreen} openBooking={openBooking} />}
          {screen === "agenda" && <AgendaScreen role={role} data={data} services={services} barbers={barbers} selectedDate={selectedDate} setSelectedDate={setSelectedDate} updateAppointment={updateAppointment} toggleBlock={toggleBlock} />}
          {screen === "team" && <TeamScreen data={data} openBooking={openBooking} />}
          {screen === "management" && role === "barber" && <EarningsScreen appointments={completed.filter(item => item.barberId === "anderson")} services={services} commission={barberCommission} revenue={barberRevenue} />}
          {screen === "management" && role === "admin" && <ManagementScreen data={data} setData={setData} newService={newService} setNewService={setNewService} addService={addService} />}
          {screen === "profile" && <ProfileScreen role={role} selectRole={selectRole} exportBackup={exportBackup} importBackup={importBackup} resetData={resetData} />}
        </div>

        <BottomNav items={navItems} screen={screen} onNavigate={(target) => target === "plus" ? openBooking() : setScreen(target as Screen)} />
      </section>

      {bookingOpen && (
        <BookingSheet
          step={bookingStep}
          setStep={setBookingStep}
          booking={booking}
          setBooking={setBooking}
          data={data}
          availableTimes={availableTimes}
          close={() => setBookingOpen(false)}
          confirm={confirmBooking}
        />
      )}
      {toast && <div className="toast"><Icon name="check" />{toast}</div>}
    </main>
  );
}

function Header({ role, items, screen, onNavigate, onOpen }: { role: Role; items: [string, IconName, string][]; screen: Screen; onNavigate: (target: string) => void; onOpen: () => void }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <img src="/bart-logo.jpg" alt="Bart do Corte" />
        <div><span>BARBEARIA</span><strong>BART DO CORTE</strong><em>Ter–Sex 09–19h · Sáb 09–18h</em></div>
      </div>
      <nav className="desktop-top-nav" aria-label="Navegação para desktop">{items.map(([target, icon, label]) => <button key={target} className={`${target === "plus" ? "desktop-top-cta" : ""} ${screen === target ? "active" : ""}`} onClick={() => onNavigate(target)}><Icon name={icon} /><b>{label}</b></button>)}</nav>
      <button className="role-button" onClick={onOpen}><span>{roleLabels[role]}</span><b>{role === "admin" ? "AD" : role === "barber" ? "AN" : "BC"}</b></button>
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

function ClientHome({ data, openBooking, setScreen }: { data: StoreData; openBooking: () => void; setScreen: (screen: Screen) => void }) {
  const next = data.appointments.find(item => item.client === "Cliente Demo" && item.status === "confirmed" && item.date >= dateISO());
  const service = data.services.find(item => item.id === next?.serviceId);
  const barber = data.barbers.find(item => item.id === next?.barberId);
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
        <div className="map-label"><b>BART DO CORTE</b><span>Localização aproximada · confirme o endereço</span></div>
      </div>
    </section>
    <section className="contact-section">
      <div className="contact-copy">
        <small>// CONTATO E LOCALIZAÇÃO</small>
        <h2>NOS<br /><span>ENCONTRE</span></h2>
        <dl><div><dt>REGIÃO</dt><dd>Campo Grande · Rio de Janeiro · RJ</dd></div><div><dt>ATENDIMENTO</dt><dd>Agendamento direto pelo aplicativo</dd></div></dl>
        <p>O endereço exato será exibido aqui assim que for confirmado.</p>
      </div>
      <div className="opening-hours">
        <small>// HORÁRIOS</small>
        <p>Exemplo visual do MVP · confirme o expediente real</p>
        <div className="hours-row muted"><span>SEGUNDA</span><b>FECHADO</b></div>
        <div className="hours-row"><span>TERÇA</span><b>09:00 – 19:00</b></div>
        <div className="hours-row"><span>QUARTA</span><b>09:00 – 19:00</b></div>
        <div className="hours-row"><span>QUINTA</span><b>09:00 – 19:00</b></div>
        <div className="hours-row"><span>SEXTA</span><b>09:00 – 19:00</b></div>
        <div className="hours-row"><span>SÁBADO</span><b>09:00 – 18:00</b></div>
        <div className="hours-row muted"><span>DOMINGO</span><b>FECHADO</b></div>
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
  const sectionRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!section || !viewport || !track) return;

    let frame = 0;
    let sectionStart = 0;
    let scrollDistance = 1;
    let horizontalDistance = 0;
    let stickyTop = 76;
    let lastProgress = -1;
    let scrollListening = false;

    const usesNativeMobileTimeline = () => window.innerWidth < 900 && CSS.supports("animation-timeline: view()");

    const measure = () => {
      stickyTop = window.innerWidth >= 900 ? 88 : 76;
      sectionStart = window.scrollY + section.getBoundingClientRect().top;
      const stickyHeight = Math.max(1, window.innerHeight - stickyTop);
      scrollDistance = Math.max(1, section.offsetHeight - stickyHeight);
      horizontalDistance = Math.max(0, track.scrollWidth - viewport.clientWidth);
    };

    const update = () => {
      frame = 0;
      const progress = Math.min(1, Math.max(0, (window.scrollY + stickyTop - sectionStart) / scrollDistance));
      if (progress === lastProgress) return;
      lastProgress = progress;
      section.style.setProperty("--look-x", `${-progress * horizontalDistance}px`);
      section.style.setProperty("--look-progress", String(progress));
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const startScrollSync = () => {
      if (scrollListening) return;
      scrollListening = true;
      measure();
      lastProgress = -1;
      requestUpdate();
      window.addEventListener("scroll", requestUpdate, { passive: true });
    };
    const stopScrollSync = () => {
      if (!scrollListening) return;
      scrollListening = false;
      window.removeEventListener("scroll", requestUpdate);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      section.style.removeProperty("--look-x");
      section.style.removeProperty("--look-progress");
    };
    const syncMotionMode = () => {
      if (usesNativeMobileTimeline()) stopScrollSync();
      else startScrollSync();
    };

    syncMotionMode();
    window.addEventListener("resize", syncMotionMode);
    return () => {
      window.removeEventListener("resize", syncMotionMode);
      stopScrollSync();
    };
  }, []);

  return <section className="lookbook-section" ref={sectionRef}>
    <div className="lookbook-pin">
      <SectionTitle overline="REFERÊNCIAS DE CORTE" title="Inspire seu visual" />
      <div className="lookbook-viewport" ref={viewportRef}>
        <div className="lookbook-track" ref={trackRef}>{haircutGallery.map(style => <button className={`look-card${style.image ? "" : " look-card--detail"}`} key={style.name} onClick={openBooking} aria-label={`Agendar ${style.name}`}>
          {style.image && <img src={style.image} alt={`Referência de ${style.name}`} loading="lazy" decoding="async" style={{ objectPosition: style.imagePosition }} />}
          <div><h3>{style.name}</h3><p>{style.detail}</p><dl className="look-card-meta"><div><dt>VALOR</dt><dd>{money.format(style.price)}</dd></div><div><dt>DURAÇÃO</dt><dd>{style.duration}</dd></div></dl><b>AGENDAR ESTE ESTILO <Icon name="arrow-right" /></b></div>
        </button>)}</div>
      </div>
      <div className="lookbook-progress" aria-hidden="true"><i /><span>ROLE PARA VER TODOS OS CORTES</span></div>
    </div>
  </section>;
}

function BarberHome({ appointments, services, revenue, commission }: { appointments: Appointment[]; services: Map<string, Service>; revenue: number; commission: number }) {
  return <div className="dashboard-page">
    <PageIntro overline="BOM TRABALHO, ANDERSON" title="Sua rotina hoje" subtitle={`${appointments.length} horários na agenda`} />
    <div className="metric-grid"><Metric label="Produção" value={money.format(revenue)} tone="gold" /><Metric label="Sua comissão" value={money.format(commission)} /><Metric label="Atendimentos" value={String(appointments.length)} /><Metric label="Ocupação" value="72%" /></div>
    <SectionTitle overline="AGENDA DE HOJE" title="Próximos clientes" />
    <div className="appointment-list">{appointments.map(item => <CompactAppointment key={item.id} item={item} service={services.get(item.serviceId)} />)}</div>
    <div className="goal-card"><div><small>META DO MÊS</small><strong>68%</strong></div><p>Faltam {money.format(640)} para sua meta</p><div><i style={{ width: "68%" }} /></div></div>
  </div>;
}

function AdminHome({ data, services, revenue, todayAppointments, setScreen, openBooking }: { data: StoreData; services: Map<string, Service>; revenue: number; todayAppointments: Appointment[]; setScreen: (screen: Screen) => void; openBooking: () => void }) {
  const pending = data.appointments.filter(item => item.status === "completed").reduce((sum, item) => sum + (services.get(item.serviceId)?.price ?? 0) * ((data.barbers.find(barber => barber.id === item.barberId)?.commission ?? 0) / 100), 0);
  const clientCount = new Set(data.appointments.map(item => item.phone)).size;
  const confirmedToday = todayAppointments.filter(item => item.status === "confirmed").length;
  const completedToday = todayAppointments.filter(item => item.status === "completed").length;
  const occupancy = Math.min(100, Math.round((todayAppointments.length / 10) * 100));
  const weeklyMovement = [38, 56, 44, 72, 92, 66, 34];
  const weekdays = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
  const barberStats = data.barbers.map(barber => {
    const appointments = data.appointments.filter(item => item.barberId === barber.id && item.status === "completed");
    const produced = appointments.reduce((sum, item) => sum + (services.get(item.serviceId)?.price ?? 0), 0);
    return { ...barber, appointments: appointments.length, produced, commissionValue: produced * barber.commission / 100 };
  });

  return <div className="dashboard-page admin-dashboard">
    <header className="admin-overview-head">
      <div><small>PAINEL DO PROPRIETÁRIO</small><h1>Visão geral</h1><p>Acompanhe a operação da Bart do Corte em um só lugar.</p></div>
      <div className="admin-head-actions"><span><i /> Dados locais atualizados</span><button onClick={openBooking}>NOVO AGENDAMENTO <Icon name="plus" /></button></div>
    </header>

    <section className="admin-kpi-grid" aria-label="Indicadores da barbearia">
      <article className="admin-kpi primary"><span>FATURAMENTO REGISTRADO</span><strong>{money.format(revenue)}</strong><p>{completedToday} atendimento{completedToday === 1 ? "" : "s"} concluído{completedToday === 1 ? "" : "s"} hoje</p><i><Icon name="arrow-up-right" /></i></article>
      <article className="admin-kpi"><span>AGENDA DE HOJE</span><strong>{todayAppointments.length}</strong><p>{confirmedToday} confirmados · {completedToday} concluídos</p><i><Icon name="calendar" /></i></article>
      <article className="admin-kpi"><span>CLIENTES CADASTRADOS</span><strong>{clientCount}</strong><p>Identificados neste navegador</p><i><Icon name="user" /></i></article>
      <article className="admin-kpi"><span>COMISSÕES ESTIMADAS</span><strong>{money.format(pending)}</strong><p>Repasse acumulado da equipe</p><i><Icon name="wallet" /></i></article>
    </section>

    <div className="admin-main-grid">
      <section className="admin-revenue-panel">
        <header><div><small>MOVIMENTO SEMANAL</small><h2>Ritmo da barbearia</h2></div><div className="occupancy-badge"><span>OCUPAÇÃO HOJE</span><b>{occupancy}%</b></div></header>
        <div className="admin-bar-chart">{weeklyMovement.map((height, index) => <div className="admin-bar-column" key={weekdays[index]}><span>{height}%</span><i><b style={{ height: `${height}%` }} /></i><small>{weekdays[index]}</small></div>)}</div>
        <footer><span><i className="confirmed-dot" /> Horários ocupados</span><p>Indicadores calculados com os dados de demonstração locais.</p></footer>
      </section>

      <section className="admin-agenda-panel">
        <header><div><small>OPERAÇÃO DE HOJE</small><h2>Próximos horários</h2></div><button onClick={() => setScreen("agenda")}>VER AGENDA <Icon name="arrow-right" /></button></header>
        <div className="admin-agenda-list">{todayAppointments.length ? todayAppointments.slice(0, 5).map(item => {
          const barber = data.barbers.find(current => current.id === item.barberId);
          return <article key={item.id}><time>{item.time}</time><div><b>{item.client}</b><span>{services.get(item.serviceId)?.name} · {barber?.name}</span></div><em className={item.status}>{statusLabels[item.status]}</em></article>;
        }) : <EmptyState title="Agenda livre hoje" text="Use o botão de novo agendamento para reservar um horário." />}</div>
      </section>
    </div>

    <section className="admin-team-panel">
      <header><div><small>EQUIPE</small><h2>Desempenho dos barbeiros</h2></div><button onClick={() => setScreen("management")}>AJUSTAR COMISSÕES <Icon name="arrow-right" /></button></header>
      <div className="admin-team-grid">{barberStats.map((barber, index) => <article key={barber.id}>
        <div className="admin-barber-heading"><span>{barber.name.charAt(0)}<i>0{index + 1}</i></span><div><small>{barber.specialty}</small><h3>{barber.name}</h3></div><b>{barber.commission}%</b></div>
        <div className="admin-barber-numbers"><div><span>PRODUÇÃO</span><strong>{money.format(barber.produced)}</strong></div><div><span>COMISSÃO</span><strong>{money.format(barber.commissionValue)}</strong></div><div><span>ATENDIMENTOS</span><strong>{barber.appointments}</strong></div></div>
      </article>)}</div>
    </section>

    <section className="admin-quick-actions"><button onClick={openBooking}><span><Icon name="plus" /></span><div><b>Novo agendamento</b><small>Adicionar cliente à agenda</small></div><i><Icon name="arrow-right" /></i></button><button onClick={() => setScreen("agenda")}><span><Icon name="calendar" /></span><div><b>Agenda completa</b><small>Consultar horários da equipe</small></div><i><Icon name="arrow-right" /></i></button><button onClick={() => setScreen("management")}><span><Icon name="grid" /></span><div><b>Serviços e comissões</b><small>Configurar operação</small></div><i><Icon name="arrow-right" /></i></button></section>
  </div>;
}

function AgendaScreen({ role, data, services, barbers, selectedDate, setSelectedDate, updateAppointment, toggleBlock }: { role: Role; data: StoreData; services: Map<string, Service>; barbers: Map<string, Barber>; selectedDate: string; setSelectedDate: (date: string) => void; updateAppointment: (id: string, status: Status, paid?: boolean) => void; toggleBlock: (time: string) => void }) {
  const dates = Array.from({ length: 7 }, (_, index) => dateISO(index));
  const dayItems = data.appointments.filter(item => item.date === selectedDate && (role !== "barber" || item.barberId === "anderson")).sort((a, b) => a.time.localeCompare(b.time));
  return <div className="dashboard-page agenda-page">
    <PageIntro overline={role === "client" ? "MEUS HORÁRIOS" : "AGENDA DA EQUIPE"} title="Agenda" subtitle={formatDate(selectedDate)} />
    <div className="date-strip">{dates.map(date => <button key={date} className={date === selectedDate ? "active" : ""} onClick={() => setSelectedDate(date)}><span>{weekday(date)}</span><b>{date.slice(-2)}</b></button>)}</div>
    {role === "barber" && <div className="block-row"><span>Bloqueio rápido:</span>{["12:00", "12:30", "18:00"].map(time => <button key={time} onClick={() => toggleBlock(time)}>{time}</button>)}</div>}
    <div className="timeline">{dayItems.length ? dayItems.map(item => <article key={item.id} className={`timeline-item status-${item.status}`}><time>{item.time}</time><div><span className="status-pill">{statusLabels[item.status]}</span><h3>{services.get(item.serviceId)?.name}</h3><p>{role === "client" ? `com ${barbers.get(item.barberId)?.name}` : item.client}</p>{role !== "client" && <small>{item.phone} · {money.format(services.get(item.serviceId)?.price ?? 0)}</small>}<div className="item-actions">{item.status === "confirmed" && role !== "client" && <button onClick={() => updateAppointment(item.id, "completed", true)}>Concluir</button>}{item.status === "confirmed" && <button className="ghost" onClick={() => updateAppointment(item.id, "cancelled")}>Cancelar</button>}</div></div></article>) : <EmptyState title="Nenhum horário neste dia" text="Escolha outra data ou crie um novo agendamento." />}</div>
  </div>;
}

function TeamScreen({ data, openBooking }: { data: StoreData; openBooking: () => void }) {
  return <div className="dashboard-page"><PageIntro overline="NOSSA EQUIPE" title="Escolha seu barbeiro" subtitle="Profissionais da Bart do Corte" /><div className="team-grid">{data.barbers.filter(item => item.active).map((item, index) => <article key={item.id}><div className="barber-avatar">{item.name.slice(0, 1)}<span>0{index + 1}</span></div><small>BARBEIRO</small><h3>{item.name}</h3><p>{item.specialty}</p><button onClick={openBooking}>VER HORÁRIOS <Icon name="arrow-right" /></button></article>)}</div></div>;
}

function EarningsScreen({ appointments, services, commission, revenue }: { appointments: Appointment[]; services: Map<string, Service>; commission: number; revenue: number }) {
  return <div className="dashboard-page"><PageIntro overline="TRANSPARÊNCIA" title="Meus ganhos" subtitle="Produção e comissão acumulada" /><div className="earnings-hero"><small>VALOR A RECEBER</small><strong>{money.format(commission)}</strong><p>50% sobre {money.format(revenue)} produzidos</p></div><div className="financial-list"><div><span>Já recebido</span><b>{money.format(commission * .6)}</b></div><div><span>Pendente</span><b className="gold-text">{money.format(commission * .4)}</b></div><div><span>Atendimentos</span><b>{appointments.length}</b></div></div><SectionTitle overline="HISTÓRICO" title="Últimos atendimentos" /><div className="appointment-list">{appointments.map(item => <CompactAppointment key={item.id} item={item} service={services.get(item.serviceId)} />)}</div></div>;
}

function ManagementScreen({ data, setData, newService, setNewService, addService }: { data: StoreData; setData: (updater: (current: StoreData) => StoreData) => void; newService: { name: string; price: string; duration: string }; setNewService: (value: { name: string; price: string; duration: string }) => void; addService: () => void }) {
  return <div className="dashboard-page"><PageIntro overline="CONFIGURAÇÃO LOCAL" title="Gestão" subtitle="Serviços, equipe e comissões" /><SectionTitle overline="CATÁLOGO" title="Serviços" /><div className="manage-list">{data.services.map(item => <article key={item.id}><div><b>{item.name}</b><span>{item.duration} min · {money.format(item.price)}</span></div><button className={item.active ? "toggle active" : "toggle"} aria-label={`Ativar ou desativar ${item.name}`} onClick={() => setData(current => ({ ...current, services: current.services.map(service => service.id === item.id ? { ...service, active: !service.active } : service) }))}><i /></button></article>)}</div><div className="add-form"><small>NOVO SERVIÇO</small><input placeholder="Nome" value={newService.name} onChange={event => setNewService({ ...newService, name: event.target.value })} /><div><input inputMode="decimal" placeholder="Preço" value={newService.price} onChange={event => setNewService({ ...newService, price: event.target.value })} /><input inputMode="numeric" placeholder="Minutos" value={newService.duration} onChange={event => setNewService({ ...newService, duration: event.target.value })} /></div><button onClick={addService}>CADASTRAR SERVIÇO</button></div><SectionTitle overline="EQUIPE" title="Comissões" /><div className="manage-list">{data.barbers.map(item => <article key={item.id}><div><b>{item.name}</b><span>{item.specialty}</span></div><label><input type="number" min="0" max="100" value={item.commission} onChange={event => setData(current => ({ ...current, barbers: current.barbers.map(barber => barber.id === item.id ? { ...barber, commission: Number(event.target.value) } : barber) }))} />%</label></article>)}</div></div>;
}

function ProfileScreen({ role, selectRole, exportBackup, importBackup, resetData }: { role: Role; selectRole: (role: Role) => void; exportBackup: () => void; importBackup: (event: ChangeEvent<HTMLInputElement>) => void; resetData: () => void }) {
  return <div className="dashboard-page"><PageIntro overline="CONTA LOCAL" title="Perfil e dados" subtitle="Este MVP salva tudo neste navegador" /><div className="profile-card"><div className="large-avatar">{role === "admin" ? "AD" : role === "barber" ? "AN" : "CD"}</div><small>ACESSO ATUAL</small><h2>{roleLabels[role]}</h2><p>{role === "client" ? "Cliente Demo" : role === "barber" ? "Anderson" : "Administrador Bart do Corte"}</p></div><SectionTitle overline="DEMONSTRAÇÃO" title="Trocar de acesso" /><div className="role-grid">{(["client", "barber", "admin"] as Role[]).map(item => <button key={item} className={role === item ? "active" : ""} onClick={() => selectRole(item)}><span><Icon name={item === "client" ? "user" : item === "barber" ? "scissors" : "grid"} /></span><b>{roleLabels[item]}</b></button>)}</div><SectionTitle overline="SEGURANÇA LOCAL" title="Backup" /><div className="backup-actions"><button onClick={exportBackup}>EXPORTAR DADOS <Icon name="download" /></button><label>IMPORTAR BACKUP <Icon name="upload" /><input type="file" accept="application/json" onChange={importBackup} /></label><button className="danger" onClick={resetData}>RESTAURAR DEMONSTRAÇÃO</button></div><div className="local-warning"><b>Somente neste dispositivo</b><p>Os dados não são sincronizados com outros celulares. Exporte um backup antes de limpar o navegador.</p></div></div>;
}

function BookingSheet({ step, setStep, booking, setBooking, data, availableTimes, close, confirm }: { step: number; setStep: (step: number) => void; booking: { serviceId: string; barberId: string; date: string; time: string }; setBooking: (value: { serviceId: string; barberId: string; date: string; time: string }) => void; data: StoreData; availableTimes: string[]; close: () => void; confirm: () => void }) {
  const dates = Array.from({ length: 10 }, (_, index) => dateISO(index + 1));
  const service = data.services.find(item => item.id === booking.serviceId);
  const barber = data.barbers.find(item => item.id === booking.barberId);
  return <div className="sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><section className="booking-sheet"><header><div><small>NOVO AGENDAMENTO</small><b>Etapa {step} de 4</b></div><button onClick={close} aria-label="Fechar"><Icon name="close" /></button></header><div className="steps"><i className={step >= 1 ? "done" : ""} /><i className={step >= 2 ? "done" : ""} /><i className={step >= 3 ? "done" : ""} /><i className={step >= 4 ? "done" : ""} /></div>{step === 1 && <div className="sheet-content"><h2>Qual serviço?</h2><div className="choice-list">{data.services.filter(item => item.active).map(item => <button key={item.id} onClick={() => { setBooking({ ...booking, serviceId: item.id }); setStep(2); }}><div><b>{item.name}</b><span>{item.description} · {item.duration} min</span></div><strong>{money.format(item.price)}</strong></button>)}</div></div>}{step === 2 && <div className="sheet-content"><button className="back-link" onClick={() => setStep(1)}><Icon name="arrow-left" />Voltar</button><h2>Com quem?</h2><div className="choice-list barber-choices">{data.barbers.filter(item => item.active).map(item => <button key={item.id} onClick={() => { setBooking({ ...booking, barberId: item.id }); setStep(3); }}><i>{item.name[0]}</i><div><b>{item.name}</b><span>{item.specialty}</span></div><strong><Icon name="arrow-right" /></strong></button>)}</div></div>}{step === 3 && <div className="sheet-content"><button className="back-link" onClick={() => setStep(2)}><Icon name="arrow-left" />Voltar</button><h2>Escolha o dia</h2><div className="booking-dates">{dates.map(date => <button key={date} className={booking.date === date ? "active" : ""} onClick={() => { setBooking({ ...booking, date, time: "" }); setStep(4); }}><span>{weekday(date)}</span><b>{date.slice(-2)}</b><small>{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</small></button>)}</div></div>}{step === 4 && <div className="sheet-content"><button className="back-link" onClick={() => setStep(3)}><Icon name="arrow-left" />Voltar</button><h2>Melhor horário</h2><p className="booking-summary">{service?.name} com {barber?.name} · {formatDate(booking.date)}</p><div className="time-grid">{availableTimes.map(time => <button key={time} className={booking.time === time ? "active" : ""} onClick={() => setBooking({ ...booking, time })}>{time}</button>)}</div>{!availableTimes.length && <EmptyState title="Sem horários livres" text="Escolha outra data para continuar." />}<button className="confirm-button" disabled={!booking.time} onClick={confirm}>CONFIRMAR AGENDAMENTO <Icon name="arrow-right" /></button></div>}</section></div>;
}

function BottomNav({ items, screen, onNavigate }: { items: [string, IconName, string][]; screen: Screen; onNavigate: (target: string) => void }) {
  return <nav className="bottom-nav" aria-label="Navegação principal">{items.map(([target, icon, label]) => <button key={target} className={`${target === "plus" ? "nav-plus" : ""} ${screen === target ? "active" : ""}`} onClick={() => onNavigate(target)}><span><Icon name={icon} /></span>{target !== "plus" && label}</button>)}</nav>;
}

function SectionTitle({ title, action, onAction }: { overline: string; title: string; action?: string; onAction?: () => void }) { return <div className="section-heading"><h2>{title}</h2>{action && <button onClick={onAction}>{action}</button>}</div>; }
function PageIntro({ title, subtitle }: { overline: string; title: string; subtitle: string }) { return <div className="page-intro"><h1>{title}</h1><p>{subtitle}</p></div>; }
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) { return <article className={`metric ${tone ?? ""}`}><span>{label}</span><b>{value}</b></article>; }
function CompactAppointment({ item, service, barber }: { item: Appointment; service?: Service; barber?: string }) { return <article className="compact-appointment"><time>{item.time}</time><div><b>{service?.name}</b><span>{barber || item.client}</span></div><strong className={`dot ${item.status}`} aria-label={statusLabels[item.status]} /></article>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="empty-state"><span><Icon name="scissors" /></span><b>{title}</b><p>{text}</p></div>; }
