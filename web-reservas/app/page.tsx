"use client";

import { FormEvent, useMemo, useState } from "react";

type Service = {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  tag?: string;
};

type Barber = {
  id: string;
  name: string;
  initials: string;
  specialty: string;
};

type CalendarDay = {
  date: Date;
  id: string;
  day: number;
  outsideMonth: boolean;
  disabled: boolean;
};

type AuthMode = "google" | "email" | "guest" | null;

const services: Service[] = [
  {
    id: "corte-clasico",
    name: "Corte clásico",
    description: "Corte personalizado, asesoría y acabado con producto.",
    duration: 45,
    price: 70,
    tag: "Favorito",
  },
  {
    id: "fade",
    name: "Fade de precisión",
    description: "Degradado limpio adaptado a tu estilo y fisonomía.",
    duration: 60,
    price: 80,
  },
  {
    id: "corte-barba",
    name: "Corte + barba",
    description: "La experiencia completa: corte, diseño y perfilado.",
    duration: 75,
    price: 110,
    tag: "Experiencia",
  },
  {
    id: "barba",
    name: "Perfilado de barba",
    description: "Diseño, definición y acabado profesional de barba.",
    duration: 30,
    price: 50,
  },
];

const barbers: Barber[] = [
  { id: "empleado-1", name: "Empleado 1", initials: "E1", specialty: "Cortes clásicos y fades" },
  { id: "empleado-2", name: "Empleado 2", initials: "E2", specialty: "Fades y diseños" },
  { id: "empleado-3", name: "Empleado 3", initials: "E3", specialty: "Barba y cortes clásicos" },
  { id: "empleado-4", name: "Empleado 4", initials: "E4", specialty: "Corte y experiencia completa" },
];

const steps = ["Barbero", "Servicio", "Fecha y hora", "Tus datos", "Confirmar"];
const genders = ["Hombre", "Mujer", "Otro", "Prefiero no decir"];
const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const timeSlots = [
  "09:00", "09:45", "10:30", "11:15", "12:00", "12:45",
  "14:00", "14:45", "15:30", "16:15", "17:00", "17:45", "18:30",
];

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function dateId(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function sameDay(first: Date | null, second: Date) {
  return Boolean(first && dateId(first) === dateId(second));
}

function buildCalendar(viewMonth: Date, today: Date, maxDate: Date): CalendarDay[] {
  const first = startOfMonth(viewMonth);
  const mondayOffset = (first.getDay() + 6) % 7;
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() + index);
    const cleanDate = startOfDay(date);
    const outsideMonth = cleanDate.getMonth() !== viewMonth.getMonth();
    const closed = cleanDate.getDay() === 0;
    return {
      date: cleanDate,
      id: dateId(cleanDate),
      day: cleanDate.getDate(),
      outsideMonth,
      disabled: outsideMonth || cleanDate < today || cleanDate > maxDate || closed,
    };
  });
}

function formatMonth(value: Date) {
  const text = new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric" }).format(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatFullDate(value: Date | null) {
  if (!value) return "Por elegir";
  const text = new Intl.DateTimeFormat("es-BO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function BrandLogo({ large = false }: { large?: boolean }) {
  return (
    <span className={`logo-frame ${large ? "large" : ""}`} aria-hidden="true">
      <img src="./esquece-logo.webp" alt="" width={large ? 260 : 55} height={large ? 342 : 72} />
    </span>
  );
}

function ArrowIcon({ direction = "right" }: { direction?: "left" | "right" }) {
  return <span aria-hidden="true">{direction === "right" ? "→" : "←"}</span>;
}

export default function Home() {
  const [today] = useState(() => startOfDay(new Date()));
  const [step, setStep] = useState(0);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState("");
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [gender, setGender] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const maxDate = useMemo(() => {
    const value = new Date(today);
    value.setMonth(value.getMonth() + 3);
    return startOfDay(value);
  }, [today]);

  const maxMonth = useMemo(() => startOfMonth(maxDate), [maxDate]);
  const firstMonth = useMemo(() => startOfMonth(today), [today]);
  const calendarDays = useMemo(
    () => buildCalendar(viewMonth, today, maxDate),
    [viewMonth, today, maxDate],
  );

  const blockedSlots = useMemo(() => {
    if (!selectedBarber || !selectedDate) return new Set<string>();
    const seed = Number(selectedBarber.id.slice(-1)) + selectedDate.getDate();
    return new Set(timeSlots.filter((_, index) => (index + seed) % 5 === 0));
  }, [selectedBarber, selectedDate]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canContinue =
    (step === 0 && Boolean(selectedBarber)) ||
    (step === 1 && Boolean(selectedService)) ||
    (step === 2 && Boolean(selectedDate && selectedTime)) ||
    (step === 3 && name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 7 && Boolean(gender)) ||
    (step === 4 && (authMode === "google" || authMode === "guest" || (authMode === "email" && validEmail)));

  const sectionTitles = [
    ["Elige a tu barbero", "Tu experiencia empieza con quién te atiende"],
    ["Selecciona tu servicio", "Elige el resultado que buscas"],
    ["Escoge fecha y hora", "Reserva hasta con 3 meses de anticipación"],
    ["Cuéntanos sobre ti", "Completa los datos de la reserva"],
    ["Elige cómo continuar", "Google, correo o reserva como invitado"],
  ];

  function goNext() {
    if (!canContinue || step >= 4) return;
    setStep((current) => current + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    if (step <= 0) return;
    setStep((current) => current - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseDate(date: Date) {
    setSelectedDate(date);
    setSelectedTime("");
  }

  function moveMonth(direction: number) {
    setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  function connectGoogle() {
    setAuthMode("google");
    setEmail("");
  }

  function connectGuest() {
    setAuthMode("guest");
    setEmail("");
  }

  function connectEmail() {
    if (validEmail) setAuthMode("email");
  }

  function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canContinue) return;
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetBooking() {
    setStep(0);
    setSelectedBarber(null);
    setSelectedService(null);
    setSelectedDate(null);
    setSelectedTime("");
    setViewMonth(firstMonth);
    setGender("");
    setName("");
    setPhone("");
    setNotes("");
    setEmail("");
    setAuthMode(null);
    setSubmitted(false);
  }

  const deliveryAddress = authMode === "google" ? "tu correo de Google" : email;

  return (
    <main className="site-shell">
      <div className="utility-bar"><span>ESQUECE BARBER STUDIO</span><span>RESERVAS / COCHABAMBA / BOLIVIA</span></div>
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={resetBooking} aria-label="Esquece Barber Studio, inicio">
          <BrandLogo />
          <span className="wordmark">
            <strong>ESQUECE BARBER STUDIO</strong>
            <small>Cochabamba · Bolivia</small>
          </span>
        </button>
        <div className="topbar-actions">
          <span className="exclusive-label">EXCLUSIVO · COCHABAMBA</span>
          <button className="help-button" type="button" aria-label="Abrir atención personalizada" onClick={() => setShowHelp((value) => !value)}>
            <span aria-hidden="true">✦</span><span>Atención</span>
          </button>
          {showHelp && (
            <div className="help-popover" role="status">
              <strong>Atención personalizada</strong>
              <span>Cuando tengamos el número oficial, podrás contactar directamente con el estudio desde aquí.</span>
              <button type="button" onClick={() => setShowHelp(false)}>Entendido</button>
            </div>
          )}
        </div>
      </header>

      {submitted ? (
        <section className="success-wrap">
          <div className="success-card">
            <BrandLogo large />
            <div className="success-mark" aria-hidden="true">✓</div>
            <p className="eyebrow">Experiencia reservada</p>
            <h1>Nos vemos pronto, {name.split(" ")[0]}.</h1>
            <p className="success-copy">
              {authMode === "guest" ? (
                <>Continuaste como invitado. En la versión final recibirás los detalles por WhatsApp, sin crear una cuenta.</>
              ) : (
                <>En la versión final enviaremos todos los detalles de tu cita a <strong>{deliveryAddress}</strong>.</>
              )}
            </p>
            <div className="success-details">
              <div><span>Barbero</span><strong>{selectedBarber?.name}</strong></div>
              <div><span>Servicio</span><strong>{selectedService?.name}</strong></div>
              <div><span>Fecha</span><strong>{formatFullDate(selectedDate)}</strong></div>
              <div><span>Hora</span><strong>{selectedTime}</strong></div>
            </div>
            <div className="demo-banner">
              <span>i</span>
              <p><strong>Demostración navegable.</strong> Todavía no se guardó una reserva ni se envió un correo real.</p>
            </div>
            <button className="primary-button success-button" type="button" onClick={resetBooking}>
              Probar otra reserva <ArrowIcon />
            </button>
          </div>
        </section>
      ) : (
        <section className="booking-layout" id="top">
          <div className="booking-main">
            <section className="intro">
              <div className="hero-watermark" aria-hidden="true">
                <BrandLogo large />
                <span>ESQUECE BARBER STUDIO</span>
              </div>
              <h1 className="brand-display"><span>ESQUECE</span><span>BARBER STUDIO</span></h1>
              <p className="hero-subtitle">La barbería más exclusiva de Cochabamba.</p>
              <div className="brand-values" aria-label="Valores de Esquece">
                <span>Precisión</span><span>Identidad</span><span>Exclusividad</span>
              </div>
            </section>

            <nav className="stepper" aria-label="Progreso de la reserva">
              {steps.map((item, index) => {
                const isAvailable = index <= step;
                return (
                  <button
                    className={`step ${index === step ? "active" : ""} ${index < step ? "complete" : ""}`}
                    key={item}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => isAvailable && setStep(index)}
                    aria-current={index === step ? "step" : undefined}
                  >
                    <span>{index < step ? "✓" : index + 1}</span>
                    <small>{item}</small>
                  </button>
                );
              })}
            </nav>

            <section className="booking-card" aria-live="polite">
              <div className="section-heading">
                <div className="section-title"><span className="section-number">0{step + 1}</span><h2>{sectionTitles[step][0]}</h2></div>
                <div className="section-guidance">
                  <p>{sectionTitles[step][1]}</p>
                  {step === 2 && <p className="availability-note calendar-top-note"><span /> Los domingos y los horarios tachados no están disponibles.</p>}
                </div>
              </div>

              {step === 0 && (
                <div className="barber-grid">
                  {barbers.map((barber, index) => {
                    const selected = selectedBarber?.id === barber.id;
                    return (
                      <button className={`barber-card ${selected ? "selected" : ""}`} key={barber.id} type="button" onClick={() => setSelectedBarber(barber)} aria-pressed={selected}>
                        <span className={`barber-avatar tone-${index + 1}`} aria-hidden="true">{barber.initials}</span>
                        <span className="barber-copy"><strong>{barber.name}</strong><small>{barber.specialty}</small></span>
                        <span className="selection-dot" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              )}

              {step === 1 && (
                <div className="service-list">
                  {services.map((service) => {
                    const selected = selectedService?.id === service.id;
                    return (
                      <button className={`service-card ${selected ? "selected" : ""}`} key={service.id} onClick={() => setSelectedService(service)} type="button" aria-pressed={selected}>
                        <span className="service-copy">
                          <span className="service-title-row"><strong>{service.name}</strong>{service.tag && <em>{service.tag}</em>}</span>
                          <span>{service.description}</span><small>{service.duration} min</small>
                        </span>
                        <span className="service-price">Bs {service.price}</span>
                        <span className="selection-dot" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              )}

              {step === 2 && (
                <div className="schedule-block">
                  <div className="calendar-shell">
                    <div className="calendar-toolbar">
                      <button type="button" onClick={() => moveMonth(-1)} disabled={viewMonth <= firstMonth} aria-label="Mes anterior">←</button>
                      <div><strong>{formatMonth(viewMonth)}</strong><span>Disponible hasta {formatFullDate(maxDate)}</span></div>
                      <button type="button" onClick={() => moveMonth(1)} disabled={viewMonth >= maxMonth} aria-label="Mes siguiente">→</button>
                    </div>
                    <div className="calendar-weekdays" aria-hidden="true">
                      {weekdays.map((day) => <span key={day}>{day}</span>)}
                    </div>
                    <div className="calendar-grid" aria-label={`Calendario de ${formatMonth(viewMonth)}`}>
                      {calendarDays.map((item) => {
                        const selected = sameDay(selectedDate, item.date);
                        const isToday = sameDay(today, item.date);
                        return (
                          <button
                            className={`calendar-day ${item.outsideMonth ? "outside" : ""} ${selected ? "selected" : ""} ${isToday ? "today" : ""}`}
                            key={item.id}
                            type="button"
                            disabled={item.disabled}
                            onClick={() => chooseDate(item.date)}
                            aria-pressed={selected}
                            aria-label={formatFullDate(item.date)}
                          >
                            <span>{item.day}</span>{selected && <small>Elegido</small>}
                          </button>
                        );
                      })}
                    </div>
                    <div className="calendar-legend"><span><i className="legend-dot available" />Disponible</span><span><i className="legend-dot unavailable" />No disponible</span></div>
                  </div>

                  <div className="time-heading">
                    <strong>{selectedDate ? formatFullDate(selectedDate) : "Elige una fecha en el calendario"}</strong>
                    <span>{selectedDate ? "Horarios disponibles" : "Luego selecciona tu hora"}</span>
                  </div>
                  <div className="time-grid">
                    {timeSlots.map((time) => {
                      const blocked = !selectedDate || blockedSlots.has(time);
                      const selected = selectedTime === time;
                      return <button className={`time-button ${selected ? "selected" : ""}`} key={time} type="button" disabled={blocked} onClick={() => setSelectedTime(time)} aria-pressed={selected}>{time}</button>;
                    })}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="customer-form">
                  <div className="field-group"><label htmlFor="name">Nombre y apellido</label><input id="name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Juan Pérez" autoComplete="name" /></div>
                  <div className="field-group">
                    <label htmlFor="phone">Número de WhatsApp</label>
                    <div className="phone-input"><span>+591</span><input id="phone" type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="700 00000" autoComplete="tel" /></div>
                  </div>
                  <fieldset className="gender-group full-width">
                    <legend>¿Cuál es tu género?</legend>
                    <div className="gender-options">
                      {genders.map((option) => <button className={gender === option ? "selected" : ""} key={option} type="button" onClick={() => setGender(option)} aria-pressed={gender === option}>{option}<span className="selection-dot" /></button>)}
                    </div>
                  </fieldset>
                  <div className="field-group full-width"><label htmlFor="notes">Indicaciones para el barbero <span>(opcional)</span></label><textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Cuéntanos si tienes alguna preferencia…" rows={4} /></div>
                  <div className="privacy-note full-width"><span>✓</span><p>En esta demostración no se guardará ninguna información personal.</p></div>
                </div>
              )}

              {step === 4 && (
                <form className="login-panel" id="booking-login-form" onSubmit={submitBooking}>
                  <div className="login-intro"><span className="lock-mark">✦</span><div><strong>Confirma a tu manera</strong><p>Accede con una cuenta o continúa sin registrarte. Tú eliges.</p></div></div>
                  <div className="auth-options">
                    <button className={`google-button ${authMode === "google" ? "connected" : ""}`} type="button" onClick={connectGoogle}>
                      <span className="google-g">G</span>{authMode === "google" ? "Google conectado" : "Continuar con Google"}<span>{authMode === "google" ? "✓" : "→"}</span>
                    </button>
                    <button className={`guest-button ${authMode === "guest" ? "connected" : ""}`} type="button" onClick={connectGuest}>
                      <span className="guest-mark">↗</span>{authMode === "guest" ? "Invitado seleccionado" : "Continuar como invitado"}<span>{authMode === "guest" ? "✓" : "→"}</span>
                    </button>
                  </div>
                  <div className="login-divider"><span>o continúa con tu correo</span></div>
                  <div className="email-login">
                    <label htmlFor="email">Correo electrónico</label>
                    <div><input id="email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setAuthMode(null); }} placeholder="nombre@correo.com" autoComplete="email" /><button type="button" onClick={connectEmail} disabled={!validEmail}>{authMode === "email" ? "Conectado ✓" : "Usar correo"}</button></div>
                  </div>
                  <div className="final-review">
                    <div><span>Barbero</span><strong>{selectedBarber?.name}</strong></div>
                    <div><span>Servicio</span><strong>{selectedService?.name}</strong></div>
                    <div><span>Fecha</span><strong>{formatFullDate(selectedDate)}</strong></div>
                    <div><span>Hora</span><strong>{selectedTime}</strong></div>
                  </div>
                  <p className="auth-demo-note">Google, correo e invitado son opciones simuladas en esta versión.</p>
                </form>
              )}

              <div className="inline-actions">
                {step > 0 ? <button className="secondary-button" type="button" onClick={goBack}><ArrowIcon direction="left" /> Atrás</button> : <span />}
                {step < 4 ? <button className="primary-button inline-primary" type="button" onClick={goNext} disabled={!canContinue}>Continuar <ArrowIcon /></button> : <button className="primary-button inline-primary" type="submit" form="booking-login-form" disabled={!canContinue}>Confirmar reserva <ArrowIcon /></button>}
              </div>
            </section>
          </div>

          <aside className="summary-panel" aria-label="Resumen de la reserva">
            <div className="summary-brand"><span>ESQUECE</span><small>Tu experiencia</small></div>
            <div className="summary-list">
              <div className={`summary-choice ${!selectedBarber ? "muted-choice" : ""}`}><span>Barbero</span><strong>{selectedBarber?.name ?? "Por elegir"}</strong>{selectedBarber && <small>{selectedBarber.specialty}</small>}</div>
              <div className={`summary-choice ${!selectedService ? "muted-choice" : ""}`}><span>Servicio</span><strong>{selectedService?.name ?? "Por elegir"}</strong>{selectedService && <small>{selectedService.duration} min · Bs {selectedService.price}</small>}</div>
              <div className={`summary-choice ${!selectedDate ? "muted-choice" : ""}`}><span>Fecha y hora</span><strong>{formatFullDate(selectedDate)}</strong>{selectedTime && <small>{selectedTime}</small>}</div>
              <div className={`summary-choice ${!gender ? "muted-choice" : ""}`}><span>Perfil</span><strong>{gender || "Por completar"}</strong>{name && <small>{name}</small>}</div>
            </div>
            <div className="summary-total"><span>Total</span><strong>{selectedService ? `Bs ${selectedService.price}` : "—"}</strong></div>
            {step < 4 ? <button className="primary-button summary-action" type="button" onClick={goNext} disabled={!canContinue}>Continuar <ArrowIcon /></button> : <button className="primary-button summary-action" type="submit" form="booking-login-form" disabled={!canContinue}>Confirmar reserva <ArrowIcon /></button>}
            <p className="demo-note">Demostración · No se realizará ningún cobro</p>
          </aside>
        </section>
      )}

      <footer className="site-footer"><span>ESQUECE BARBER STUDIO</span><p>La barbería más exclusiva de Cochabamba.</p><span>BOLIVIA · 2026</span></footer>
    </main>
  );
}
