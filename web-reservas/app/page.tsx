"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  createAppointment,
  generateIdempotencyKey,
  getAvailability,
  getBarbers,
  getBusinessSettings,
  getServices,
  normalizeBolivianPhone,
  validateSlot,
  type AvailableSlot,
  type Barber,
  type BusinessSettings,
  type CreateAppointmentResult,
  type Service,
} from "../lib/api";

type CalendarDay = {
  date: Date;
  id: string;
  day: number;
  outsideMonth: boolean;
  disabled: boolean;
};

const ANY_BARBER_ID = "__any_barber__";

const steps = ["Servicio", "Barbero", "Fecha y hora", "Tus datos", "Confirmar"];
const genders = ["Hombre", "Mujer", "Otro", "Prefiero no decir"];
const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

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

function buildCalendar(viewMonth: Date, today: Date, maxDate: Date, dayOpenByIndex: boolean[] | null): CalendarDay[] {
  const first = startOfMonth(viewMonth);
  const mondayOffset = (first.getDay() + 6) % 7;
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() + index);
    const cleanDate = startOfDay(date);
    const outsideMonth = cleanDate.getMonth() !== viewMonth.getMonth();
    const closed = dayOpenByIndex ? !dayOpenByIndex[cleanDate.getDay()] : false;
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

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Ocurrió un error inesperado. Inténtalo de nuevo.";
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

  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [services, setServices] = useState<Service[] | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [barbers, setBarbers] = useState<Barber[] | null>(null);
  const [barbersLoading, setBarbersLoading] = useState(false);
  const [barbersError, setBarbersError] = useState<string | null>(null);
  const [barbersRetryTick, setBarbersRetryTick] = useState(0);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState("");
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[] | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilityRetryTick, setAvailabilityRetryTick] = useState(0);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  const [gender, setGender] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [appointmentResult, setAppointmentResult] = useState<CreateAppointmentResult | null>(null);

  const idempotencyKeyRef = useRef<string | null>(null);
  const idempotencyPayloadRef = useRef<string | null>(null);

  // Business data — no fictitious fallback: a failure here blocks booking entirely.
  useEffect(() => {
    let cancelled = false;
    setSettingsLoading(true);
    setSettingsError(null);
    getBusinessSettings()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((err) => {
        if (!cancelled) setSettingsError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setSettingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    let cancelled = false;
    setServicesLoading(true);
    setServicesError(null);
    getServices()
      .then((data) => {
        if (!cancelled) setServices(data);
      })
      .catch((err) => {
        if (!cancelled) setServicesError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  // Barbers eligible for the chosen service — refetched every time the service changes.
  useEffect(() => {
    const serviceId = selectedService?.serviceId;
    if (!serviceId) {
      setBarbers(null);
      setBarbersError(null);
      return;
    }
    let cancelled = false;
    setBarbersLoading(true);
    setBarbersError(null);
    getBarbers(serviceId)
      .then((data) => {
        if (!cancelled) setBarbers(data);
      })
      .catch((err) => {
        if (!cancelled) setBarbersError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setBarbersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedService?.serviceId, barbersRetryTick]);

  // Real availability — refetched on service/barber/date change and whenever this step is re-entered.
  useEffect(() => {
    if (!selectedService || !selectedBarberId || !selectedDate) {
      setAvailableSlots(null);
      setAvailabilityError(null);
      return;
    }
    const serviceId = selectedService.serviceId;
    const localDate = dateId(selectedDate);
    const isAny = selectedBarberId === ANY_BARBER_ID;
    let cancelled = false;
    setAvailabilityLoading(true);
    setAvailabilityError(null);
    setAvailableSlots(null);
    getAvailability(isAny ? { serviceId, localDate, anyBarber: true } : { serviceId, localDate, barberId: selectedBarberId })
      .then((slots) => {
        if (!cancelled) setAvailableSlots(slots);
      })
      .catch((err) => {
        if (!cancelled) setAvailabilityError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService, selectedBarberId, selectedDate, step, availabilityRetryTick]);

  const dayOpenByIndex = useMemo(() => {
    if (!settings) return null;
    return [
      settings.SUNDAY_OPEN,
      settings.MONDAY_OPEN,
      settings.TUESDAY_OPEN,
      settings.WEDNESDAY_OPEN,
      settings.THURSDAY_OPEN,
      settings.FRIDAY_OPEN,
      settings.SATURDAY_OPEN,
    ];
  }, [settings]);

  const maxDate = useMemo(() => {
    const days = settings?.MAX_ADVANCE_BOOKING_DAYS ?? 90;
    const value = new Date(today);
    value.setDate(value.getDate() + days);
    return startOfDay(value);
  }, [today, settings]);

  const maxMonth = useMemo(() => startOfMonth(maxDate), [maxDate]);
  const firstMonth = useMemo(() => startOfMonth(today), [today]);
  const calendarDays = useMemo(
    () => buildCalendar(viewMonth, today, maxDate, dayOpenByIndex),
    [viewMonth, today, maxDate, dayOpenByIndex],
  );

  const phoneNormalized = useMemo(() => normalizeBolivianPhone(phone), [phone]);

  const selectedBarberName = useMemo(() => {
    if (!selectedBarberId) return null;
    if (selectedBarberId === ANY_BARBER_ID) return "Cualquier barbero disponible";
    return barbers?.find((barber) => barber.barberId === selectedBarberId)?.name ?? null;
  }, [selectedBarberId, barbers]);

  const canContinue =
    (step === 0 && Boolean(selectedService)) ||
    (step === 1 && Boolean(selectedBarberId)) ||
    (step === 2 && Boolean(selectedDate && selectedTime)) ||
    (step === 3 && name.trim().length >= 2 && phoneNormalized.valid) ||
    (step === 4 && !submitting && !appointmentResult);

  const sectionTitles: [string, string][] = [
    ["Elige tu servicio", "Elige el resultado que buscas"],
    ["Elige a tu barbero", "Tu experiencia empieza con quién te atiende"],
    [
      "Escoge fecha y hora",
      settings ? `Reserva hasta con ${settings.MAX_ADVANCE_BOOKING_DAYS} días de anticipación` : "Elige el día y la hora de tu cita",
    ],
    ["Cuéntanos sobre ti", "Completa los datos de la reserva"],
    ["Confirma tu reserva", "Revisa los datos antes de confirmar"],
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

  function chooseService(service: Service) {
    if (selectedService?.serviceId === service.serviceId) return;
    setSelectedService(service);
    setSelectedBarberId(null);
    setSelectedDate(null);
    setSelectedTime("");
    setAvailableSlots(null);
    setConflictNotice(null);
    setViewMonth(startOfMonth(new Date()));
  }

  function chooseBarber(barberId: string) {
    if (selectedBarberId === barberId) return;
    setSelectedBarberId(barberId);
    setSelectedDate(null);
    setSelectedTime("");
    setAvailableSlots(null);
    setConflictNotice(null);
  }

  function chooseDate(date: Date) {
    setSelectedDate(date);
    setSelectedTime("");
    setConflictNotice(null);
  }

  function moveMonth(direction: number) {
    setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  function buildCustomerNotes(): string | undefined {
    const parts: string[] = [];
    if (gender) parts.push(`Género indicado por el cliente: ${gender}.`);
    const trimmedNotes = notes.trim();
    if (trimmedNotes) parts.push(`Notas del cliente: ${trimmedNotes}`);
    return parts.length ? parts.join(" ") : undefined;
  }

  function handleSlotUnavailable() {
    setConflictNotice("Ese horario acaba de ocuparse. Elige otro horario disponible.");
    setSelectedTime("");
    setAvailableSlots(null);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !selectedService || !selectedBarberId || !selectedDate || !selectedTime) return;

    const isAny = selectedBarberId === ANY_BARBER_ID;
    const localDate = dateId(selectedDate);
    const customer = { name: name.trim(), phoneE164: phoneNormalized.value };
    const customerNotes = buildCustomerNotes();

    const payloadSnapshot = JSON.stringify({
      serviceId: selectedService.serviceId,
      barberId: isAny ? null : selectedBarberId,
      anyBarber: isAny,
      localDate,
      localStartTime: selectedTime,
      customer,
      customerNotes: customerNotes ?? null,
    });

    let idempotencyKey: string;
    if (idempotencyKeyRef.current && idempotencyPayloadRef.current === payloadSnapshot) {
      idempotencyKey = idempotencyKeyRef.current;
    } else {
      idempotencyKey = generateIdempotencyKey();
      idempotencyKeyRef.current = idempotencyKey;
      idempotencyPayloadRef.current = payloadSnapshot;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      if (!isAny) {
        const validation = await validateSlot({
          serviceId: selectedService.serviceId,
          barberId: selectedBarberId,
          localDate,
          localStartTime: selectedTime,
        });
        if (!validation.valid) {
          handleSlotUnavailable();
          return;
        }
      }

      const result = await createAppointment({
        idempotencyKey,
        serviceId: selectedService.serviceId,
        ...(isAny ? { anyBarber: true } : { barberId: selectedBarberId }),
        localDate,
        localStartTime: selectedTime,
        customer,
        customerNotes,
      });

      setAppointmentResult(result);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            "esquece:lastBooking",
            JSON.stringify({ reference: result.appointment.reference, managementToken: result.managementToken }),
          );
        } catch {
          // localStorage can be unavailable (e.g. private browsing) — the booking itself already succeeded.
        }
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "SLOT_UNAVAILABLE") {
        handleSlotUnavailable();
        return;
      }
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function resetBooking() {
    setStep(0);
    setSelectedService(null);
    setSelectedBarberId(null);
    setSelectedDate(null);
    setSelectedTime("");
    setViewMonth(firstMonth);
    setAvailableSlots(null);
    setConflictNotice(null);
    setGender("");
    setName("");
    setPhone("");
    setNotes("");
    setSubmitError(null);
    setAppointmentResult(null);
    idempotencyKeyRef.current = null;
    idempotencyPayloadRef.current = null;
  }

  const initialLoading = settingsLoading || servicesLoading;
  const initialErrorMessage =
    [...new Set([settingsError, servicesError].filter((value): value is string => Boolean(value)))].join(" ") || null;

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

      {appointmentResult ? (
        <section className="success-wrap">
          <div className="success-card">
            <BrandLogo large />
            <div className="success-mark" aria-hidden="true">✓</div>
            <p className="eyebrow">Reserva confirmada</p>
            <h1>Nos vemos pronto, {appointmentResult.appointment.customerNameSnapshot.split(" ")[0]}.</h1>
            <p className="success-copy">
              Guarda tu referencia de reserva: <strong>{appointmentResult.appointment.reference}</strong>. Te
              contactaremos por WhatsApp al número indicado si necesitamos coordinar algo más.
            </p>
            <div className="success-details">
              <div><span>Servicio</span><strong>{appointmentResult.appointment.serviceNameSnapshot}</strong></div>
              <div><span>Barbero</span><strong>{appointmentResult.appointment.barberNameSnapshot}</strong></div>
              <div><span>Fecha</span><strong>{appointmentResult.appointment.localDate}</strong></div>
              <div><span>Hora</span><strong>{appointmentResult.appointment.localStartTime}</strong></div>
            </div>
            <div className="success-details">
              <div><span>Estado</span><strong>{appointmentResult.appointment.status}</strong></div>
              <div><span>Precio</span><strong>{settings?.CURRENCY ?? ""} {appointmentResult.appointment.servicePriceSnapshot}</strong></div>
              <div><span>Referencia</span><strong>{appointmentResult.appointment.reference}</strong></div>
              <div />
            </div>
            <div className="demo-banner">
              <span>i</span>
              <p><strong>No se realizó ningún cobro.</strong> El pago se realiza directamente en el estudio.</p>
            </div>
            <button className="primary-button success-button" type="button" onClick={resetBooking}>
              Hacer otra reserva <ArrowIcon />
            </button>
          </div>
        </section>
      ) : initialLoading ? (
        <section className="success-wrap">
          <div className="success-card">
            <BrandLogo large />
            <p className="state-banner">Cargando información de Esquece Barber Studio…</p>
          </div>
        </section>
      ) : initialErrorMessage ? (
        <section className="success-wrap">
          <div className="success-card">
            <p className="eyebrow">No se pudo conectar</p>
            <h1>Vuelve a intentarlo</h1>
            <p className="success-copy">{initialErrorMessage}</p>
            <button className="primary-button success-button" type="button" onClick={() => setLoadAttempt((n) => n + 1)}>
              Reintentar <ArrowIcon />
            </button>
          </div>
        </section>
      ) : !services || services.length === 0 ? (
        <section className="success-wrap">
          <div className="success-card">
            <p className="eyebrow">Sin servicios</p>
            <h1>No hay servicios disponibles</h1>
            <p className="success-copy">Por el momento no hay servicios disponibles para reservar en línea. Intenta más tarde.</p>
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
                  {step === 2 && <p className="availability-note calendar-top-note"><span /> Los días y horarios no disponibles están deshabilitados.</p>}
                </div>
              </div>

              {step === 0 && (
                <div className="service-list">
                  {services.map((service) => {
                    const selected = selectedService?.serviceId === service.serviceId;
                    return (
                      <button className={`service-card ${selected ? "selected" : ""}`} key={service.serviceId} onClick={() => chooseService(service)} type="button" aria-pressed={selected}>
                        <span className="service-copy">
                          <span className="service-title-row"><strong>{service.name}</strong></span>
                          <span>{service.description}</span><small>{service.durationMinutes} min</small>
                        </span>
                        <span className="service-price">{service.currency} {service.price}</span>
                        <span className="selection-dot" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              )}

              {step === 1 && (
                <div className="barber-grid">
                  {barbersLoading && <p className="state-banner">Cargando barberos disponibles…</p>}
                  {!barbersLoading && barbersError && (
                    <div className="state-banner error-banner">
                      <span>!</span>
                      <p>{barbersError}</p>
                      <button type="button" className="secondary-button" onClick={() => setBarbersRetryTick((n) => n + 1)}>Reintentar</button>
                    </div>
                  )}
                  {!barbersLoading && !barbersError && barbers && barbers.length === 0 && !settings?.ALLOW_ANY_BARBER && (
                    <p className="state-banner">No hay barberos disponibles para este servicio por ahora.</p>
                  )}
                  {!barbersLoading && !barbersError && barbers && (
                    <>
                      {settings?.ALLOW_ANY_BARBER && (
                        <button
                          className={`barber-card ${selectedBarberId === ANY_BARBER_ID ? "selected" : ""}`}
                          type="button"
                          onClick={() => chooseBarber(ANY_BARBER_ID)}
                          aria-pressed={selectedBarberId === ANY_BARBER_ID}
                        >
                          <span className="barber-avatar" aria-hidden="true">✦</span>
                          <span className="barber-copy"><strong>Cualquier barbero disponible</strong><small>Te asignamos el primero libre en tu horario</small></span>
                          <span className="selection-dot" aria-hidden="true" />
                        </button>
                      )}
                      {barbers.map((barber, index) => {
                        const selected = selectedBarberId === barber.barberId;
                        const initials = barber.name
                          .split(" ")
                          .map((part) => part[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join("")
                          .toUpperCase();
                        return (
                          <button className={`barber-card ${selected ? "selected" : ""}`} key={barber.barberId} type="button" onClick={() => chooseBarber(barber.barberId)} aria-pressed={selected}>
                            <span className={`barber-avatar tone-${(index % 4) + 1}`} aria-hidden="true">{initials || "?"}</span>
                            <span className="barber-copy"><strong>{barber.name}</strong><small>{barber.specialties || "Barbero de Esquece"}</small></span>
                            <span className="selection-dot" aria-hidden="true" />
                          </button>
                        );
                      })}
                    </>
                  )}
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

                  {conflictNotice && (
                    <div className="state-banner error-banner">
                      <span>!</span><p>{conflictNotice}</p>
                    </div>
                  )}

                  {selectedDate && availabilityLoading && <p className="state-banner">Cargando horarios disponibles…</p>}
                  {selectedDate && !availabilityLoading && availabilityError && (
                    <div className="state-banner error-banner">
                      <span>!</span>
                      <p>{availabilityError}</p>
                      <button type="button" className="secondary-button" onClick={() => setAvailabilityRetryTick((n) => n + 1)}>Reintentar</button>
                    </div>
                  )}
                  {selectedDate && !availabilityLoading && !availabilityError && availableSlots && availableSlots.length === 0 && (
                    <p className="state-banner">No quedan horarios disponibles para esta fecha. Elige otro día.</p>
                  )}
                  {selectedDate && !availabilityLoading && !availabilityError && availableSlots && availableSlots.length > 0 && (
                    <div className="time-grid">
                      {availableSlots.map((slot) => {
                        const selected = selectedTime === slot.localStartTime;
                        return (
                          <button className={`time-button ${selected ? "selected" : ""}`} key={slot.localStartTime} type="button" onClick={() => setSelectedTime(slot.localStartTime)} aria-pressed={selected}>
                            {slot.localStartTime}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="customer-form">
                  <div className="field-group"><label htmlFor="name">Nombre y apellido</label><input id="name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Juan Pérez" autoComplete="name" /></div>
                  <div className="field-group">
                    <label htmlFor="phone">Número de WhatsApp</label>
                    <div className="phone-input"><span>+591</span><input id="phone" type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="700 00000" autoComplete="tel" /></div>
                    {phone.trim().length > 0 && !phoneNormalized.valid && (
                      <small className="field-hint">Ingresa un número boliviano válido (8 dígitos, empieza con 6 o 7).</small>
                    )}
                  </div>
                  <fieldset className="gender-group full-width">
                    <legend>¿Cuál es tu género? <span>(opcional)</span></legend>
                    <div className="gender-options">
                      {genders.map((option) => (
                        <button className={gender === option ? "selected" : ""} key={option} type="button" onClick={() => setGender((current) => (current === option ? "" : option))} aria-pressed={gender === option}>
                          {option}<span className="selection-dot" />
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="field-group full-width"><label htmlFor="notes">Indicaciones para el barbero <span>(opcional)</span></label><textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Cuéntanos si tienes alguna preferencia…" rows={4} /></div>
                  <div className="privacy-note full-width"><span>✓</span><p>Usaremos estos datos únicamente para confirmar y gestionar tu cita.</p></div>
                </div>
              )}

              {step === 4 && (
                <form className="login-panel" id="booking-confirm-form" onSubmit={submitBooking}>
                  <div className="login-intro"><span className="lock-mark">✦</span><div><strong>Revisa tu reserva</strong><p>Verifica los datos antes de confirmar. Al confirmar, tu cita se registra de inmediato.</p></div></div>
                  <div className="final-review">
                    <div><span>Servicio</span><strong>{selectedService?.name}</strong></div>
                    <div><span>Barbero</span><strong>{selectedBarberName}</strong></div>
                    <div><span>Fecha</span><strong>{formatFullDate(selectedDate)}</strong></div>
                    <div><span>Hora</span><strong>{selectedTime}</strong></div>
                  </div>
                  <div className="final-review">
                    <div><span>Nombre</span><strong>{name}</strong></div>
                    <div><span>WhatsApp</span><strong>{phoneNormalized.value}</strong></div>
                    <div><span>Precio</span><strong>{selectedService ? `${selectedService.currency} ${selectedService.price}` : "—"}</strong></div>
                    <div><span>Estado</span><strong>Por confirmar</strong></div>
                  </div>
                  {submitError && (
                    <div className="state-banner error-banner">
                      <span>!</span><p>{submitError}</p>
                    </div>
                  )}
                  <p className="auth-demo-note">No se realizará ningún cobro aquí. Recibirás la confirmación por WhatsApp.</p>
                </form>
              )}

              <div className="inline-actions">
                {step > 0 ? <button className="secondary-button" type="button" onClick={goBack}><ArrowIcon direction="left" /> Atrás</button> : <span />}
                {step < 4 ? (
                  <button key="continue" className="primary-button inline-primary" type="button" onClick={goNext} disabled={!canContinue}>Continuar <ArrowIcon /></button>
                ) : (
                  <button key="submit" className="primary-button inline-primary" type="submit" form="booking-confirm-form" disabled={!canContinue}>
                    {submitting ? "Confirmando…" : "Confirmar reserva"} <ArrowIcon />
                  </button>
                )}
              </div>
            </section>
          </div>

          <aside className="summary-panel" aria-label="Resumen de la reserva">
            <div className="summary-brand"><span>ESQUECE</span><small>Tu experiencia</small></div>
            <div className="summary-list">
              <div className={`summary-choice ${!selectedService ? "muted-choice" : ""}`}><span>Servicio</span><strong>{selectedService?.name ?? "Por elegir"}</strong>{selectedService && <small>{selectedService.durationMinutes} min · {selectedService.currency} {selectedService.price}</small>}</div>
              <div className={`summary-choice ${!selectedBarberId ? "muted-choice" : ""}`}><span>Barbero</span><strong>{selectedBarberName ?? "Por elegir"}</strong></div>
              <div className={`summary-choice ${!selectedDate ? "muted-choice" : ""}`}><span>Fecha y hora</span><strong>{formatFullDate(selectedDate)}</strong>{selectedTime && <small>{selectedTime}</small>}</div>
              <div className={`summary-choice ${!name ? "muted-choice" : ""}`}><span>Contacto</span><strong>{name || "Por completar"}</strong>{phone && <small>{phoneNormalized.value}</small>}</div>
            </div>
            <div className="summary-total"><span>Total</span><strong>{selectedService ? `${selectedService.currency} ${selectedService.price}` : "—"}</strong></div>
            {step < 4 ? (
              <button key="continue" className="primary-button summary-action" type="button" onClick={goNext} disabled={!canContinue}>Continuar <ArrowIcon /></button>
            ) : (
              <button key="submit" className="primary-button summary-action" type="submit" form="booking-confirm-form" disabled={!canContinue}>
                {submitting ? "Confirmando reserva…" : "Confirmar reserva"} <ArrowIcon />
              </button>
            )}
            <p className="demo-note">No se realizará ningún cobro en este momento.</p>
          </aside>
        </section>
      )}

      <footer className="site-footer"><span>ESQUECE BARBER STUDIO</span><p>La barbería más exclusiva de Cochabamba.</p><span>BOLIVIA · 2026</span></footer>
    </main>
  );
}
