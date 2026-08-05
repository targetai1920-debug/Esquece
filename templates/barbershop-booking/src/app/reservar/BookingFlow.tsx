"use client";

import { useEffect, useMemo, useState } from "react";
import type { FlowStep } from "@/config/schema";

interface ServiceOption {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
}
interface StaffOption {
  id: string;
  name: string;
}
interface SlotOption {
  localStartTime: string;
  localEndTime: string;
  staffIds: string[];
}

interface Props {
  flowOrder: FlowStep[];
  currencyCode: string;
  confirmationMessage: string;
  customerFields: { name: boolean; phone: boolean; email: boolean; notes: boolean };
}

interface BookingState {
  serviceId: string | null;
  staffId: string | null;
  anyStaff: boolean;
  localDate: string;
  localStartTime: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerNotes: string;
}

const emptyState: BookingState = {
  serviceId: null,
  staffId: null,
  anyStaff: false,
  localDate: new Date().toISOString().slice(0, 10),
  localStartTime: null,
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  customerNotes: "",
};

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `key-${Date.now()}-${Math.random()}`;
}

/**
 * Step order is entirely driven by `flowOrder` — reordering it in
 * client-config.json (e.g. staff before service) changes the flow without
 * touching this component, per
 * .claude/skills/barbershop-crm-builder/references/public-api-and-booking-website.md.
 */
export function BookingFlow({ flowOrder, confirmationMessage, customerFields }: Props) {
  const [state, setState] = useState<BookingState>(emptyState);
  const [stepIndex, setStepIndex] = useState(0);
  const [services, setServices] = useState<ServiceOption[] | null>(null);
  const [staff, setStaff] = useState<StaffOption[] | null>(null);
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ reference: string; status: string; price: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey());

  useEffect(() => {
    fetch("/api/public/services")
      .then((r) => r.json())
      .then((body) => setServices(body.data))
      .catch(() => setLoadError("No se pudieron cargar los servicios. Intenta de nuevo."));
  }, []);

  useEffect(() => {
    if (!state.serviceId) return;
    fetch(`/api/public/staff?serviceId=${encodeURIComponent(state.serviceId)}`)
      .then((r) => r.json())
      .then((body) => setStaff(body.data))
      .catch(() => setLoadError("No se pudo cargar el equipo disponible. Intenta de nuevo."));
  }, [state.serviceId]);

  useEffect(() => {
    if (!state.serviceId || !state.localDate || (!state.staffId && !state.anyStaff)) return;
    queueMicrotask(() => setSlots(null));
    fetch("/api/public/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId: state.serviceId, localDate: state.localDate, staffId: state.staffId ?? undefined, anyStaff: state.anyStaff }),
    })
      .then((r) => r.json())
      .then((body) => setSlots(body.data))
      .catch(() => setLoadError("No se pudo cargar la disponibilidad. Intenta de nuevo."));
  }, [state.serviceId, state.staffId, state.anyStaff, state.localDate]);

  function updateState(patch: Partial<BookingState>, resetsBooking = false) {
    setState((prev) => ({ ...prev, ...patch }));
    if (resetsBooking) setIdempotencyKey(newIdempotencyKey());
  }

  const currentStep = flowOrder[stepIndex];
  const isLastStep = stepIndex === flowOrder.length - 1;

  const canAdvance = useMemo(() => {
    switch (currentStep) {
      case "service":
        return Boolean(state.serviceId);
      case "staff":
        return Boolean(state.staffId) || state.anyStaff;
      case "datetime":
        return Boolean(state.localStartTime);
      case "customer":
        return (!customerFields.name || state.customerName.trim().length > 0) && (!customerFields.phone || state.customerPhone.trim().length > 0);
      case "confirmation":
        return true;
      default:
        return false;
    }
  }, [currentStep, state, customerFields]);

  async function submitBooking() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/public/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          serviceId: state.serviceId,
          staffId: state.staffId ?? undefined,
          anyStaff: state.anyStaff,
          localDate: state.localDate,
          localStartTime: state.localStartTime,
          customer: { name: state.customerName, phone: state.customerPhone, email: state.customerEmail || undefined },
          customerNotes: state.customerNotes || undefined,
        }),
      });
      const body = await response.json();
      if (!body.ok) {
        if (body.error?.code === "SLOT_UNAVAILABLE") {
          setSubmitError("Ese horario se acaba de ocupar. Elige otro horario disponible.");
          updateState({ localStartTime: null });
          setStepIndex(flowOrder.indexOf("datetime"));
          return;
        }
        setSubmitError(body.error?.message ?? "No se pudo completar la reserva.");
        return;
      }
      setResult({
        reference: body.data.appointment.reference,
        status: body.data.appointment.status,
        price: body.data.appointment.servicePriceSnapshot,
      });
    } catch {
      setSubmitError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="card">
        <h2>{confirmationMessage}</h2>
        <p>Referencia: {result.reference}</p>
        <p>Estado: {result.status}</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card">
        <p>{loadError}</p>
        <button onClick={() => window.location.reload()}>Reintentar</button>
      </div>
    );
  }

  return (
    <div>
      {currentStep === "service" && (
        <section>
          <h2>Elige un servicio</h2>
          {services === null && <p>Cargando servicios…</p>}
          {services?.length === 0 && <p>No hay servicios disponibles en este momento.</p>}
          {services?.map((service) => (
            <button
              key={service.id}
              className={state.serviceId === service.id ? "" : "outline"}
              onClick={() => updateState({ serviceId: service.id, staffId: null, localStartTime: null }, true)}
            >
              {service.name} — {service.durationMinutes} min
            </button>
          ))}
        </section>
      )}

      {currentStep === "staff" && (
        <section>
          <h2>Elige un profesional</h2>
          <button className={state.anyStaff ? "" : "outline"} onClick={() => updateState({ anyStaff: true, staffId: null, localStartTime: null }, true)}>
            Cualquiera disponible
          </button>
          {staff === null && <p>Cargando equipo…</p>}
          {staff?.map((member) => (
            <button
              key={member.id}
              className={state.staffId === member.id ? "" : "outline"}
              onClick={() => updateState({ staffId: member.id, anyStaff: false, localStartTime: null }, true)}
            >
              {member.name}
            </button>
          ))}
        </section>
      )}

      {currentStep === "datetime" && (
        <section>
          <h2>Elige fecha y hora</h2>
          <input
            type="date"
            value={state.localDate}
            onChange={(e) => updateState({ localDate: e.target.value, localStartTime: null }, true)}
          />
          {slots === null && <p>Cargando disponibilidad…</p>}
          {slots?.length === 0 && <p>No hay horarios disponibles ese día.</p>}
          {slots?.map((slot) => (
            <button
              key={slot.localStartTime}
              className={state.localStartTime === slot.localStartTime ? "" : "outline"}
              onClick={() => updateState({ localStartTime: slot.localStartTime })}
            >
              {slot.localStartTime}
            </button>
          ))}
        </section>
      )}

      {currentStep === "customer" && (
        <section>
          <h2>Tus datos</h2>
          {customerFields.name && (
            <input placeholder="Nombre" value={state.customerName} onChange={(e) => updateState({ customerName: e.target.value })} />
          )}
          {customerFields.phone && (
            <input placeholder="Teléfono" value={state.customerPhone} onChange={(e) => updateState({ customerPhone: e.target.value })} />
          )}
          {customerFields.email && (
            <input placeholder="Correo (opcional)" value={state.customerEmail} onChange={(e) => updateState({ customerEmail: e.target.value })} />
          )}
          {customerFields.notes && (
            <textarea placeholder="Notas (opcional)" value={state.customerNotes} onChange={(e) => updateState({ customerNotes: e.target.value })} />
          )}
        </section>
      )}

      {currentStep === "confirmation" && (
        <section>
          <h2>Revisa tu reserva</h2>
          <p>Fecha: {state.localDate}</p>
          <p>Hora: {state.localStartTime}</p>
          <p>Nombre: {state.customerName}</p>
          {submitError && <p role="alert">{submitError}</p>}
          <button disabled={submitting} onClick={submitBooking}>
            {submitting ? "Confirmando…" : "Confirmar reserva"}
          </button>
        </section>
      )}

      <div>
        {stepIndex > 0 && <button className="outline" onClick={() => setStepIndex((i) => i - 1)}>Atrás</button>}
        {!isLastStep && (
          <button disabled={!canAdvance} onClick={() => setStepIndex((i) => i + 1)}>
            Siguiente
          </button>
        )}
      </div>
    </div>
  );
}
