"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AppointmentStatus, BlockedSlot, Service, Staff, TimeOff } from "@/lib/crm/types";
import {
  adminCancelAppointmentAction,
  adminRescheduleAppointmentAction,
  completeAppointmentAction,
  confirmAppointmentAction,
  createBlockedSlotAction,
  createTimeOffAction,
  deleteBlockedSlotAction,
  deleteTimeOffAction,
  markNoShowAction,
  setServiceActiveAction,
  setServicePriceAction,
  setStaffActiveAction,
  type ActionResult,
} from "@/lib/admin/actions";

/** Shared plumbing every control below uses: run a Server Action, surface its error, refresh the page on success. */
function useAdminAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return { run, pending, error };
}

export function AppointmentActions({ appointmentId, status }: { appointmentId: string; status: AppointmentStatus }) {
  const { run, pending, error } = useAdminAction();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  const canConfirm = status === "PENDING";
  const canComplete = status === "CONFIRMED";
  const canMarkNoShow = status === "PENDING" || status === "CONFIRMED";
  const canCancel = status === "PENDING" || status === "CONFIRMED";
  const canReschedule = status === "PENDING" || status === "CONFIRMED";

  return (
    <div>
      {canConfirm && (
        <button disabled={pending} onClick={() => run(() => confirmAppointmentAction(appointmentId))}>
          Confirmar
        </button>
      )}
      {canComplete && (
        <button disabled={pending} onClick={() => run(() => completeAppointmentAction(appointmentId))}>
          Marcar completada
        </button>
      )}
      {canMarkNoShow && (
        <button disabled={pending} onClick={() => run(() => markNoShowAction(appointmentId))}>
          Marcar no-show
        </button>
      )}
      {canCancel && (
        <button disabled={pending} onClick={() => run(() => adminCancelAppointmentAction({ appointmentId }))}>
          Cancelar
        </button>
      )}
      {canReschedule && (
        <>
          <button disabled={pending} onClick={() => setRescheduleOpen((v) => !v)}>
            Reprogramar
          </button>
          {rescheduleOpen && (
            <span>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
              <button
                disabled={pending || !newDate || !newTime}
                onClick={() =>
                  run(() =>
                    adminRescheduleAppointmentAction({ appointmentId, newLocalDate: newDate, newLocalStartTime: newTime }),
                  )
                }
              >
                Confirmar nueva franja
              </button>
            </span>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function ServiceRow({ service }: { service: Service }) {
  const { run, pending, error } = useAdminAction();
  const [price, setPrice] = useState(String(service.price));

  return (
    <li>
      {service.name} —{" "}
      <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: "6rem" }} />{" "}
      {service.currency}{" "}
      <button
        disabled={pending || !(Number(price) > 0)}
        onClick={() => run(() => setServicePriceAction({ serviceId: service.id, price: Number(price) }))}
      >
        Guardar precio
      </button>
      {" — "}
      {service.durationMinutes} min —{" "}
      <button disabled={pending} onClick={() => run(() => setServiceActiveAction({ serviceId: service.id, active: !service.active }))}>
        {service.active ? "Desactivar" : "Activar"}
      </button>
      {" — "}
      {service.active ? "activo" : "inactivo"}
      {error && <span role="alert"> {error}</span>}
    </li>
  );
}

export function StaffRow({ staff }: { staff: Staff }) {
  const { run, pending, error } = useAdminAction();
  return (
    <li>
      {staff.name} — {staff.active ? "activo" : "inactivo"}{" "}
      <button disabled={pending} onClick={() => run(() => setStaffActiveAction({ staffId: staff.id, active: !staff.active }))}>
        {staff.active ? "Desactivar" : "Activar"}
      </button>
      {error && <span role="alert"> {error}</span>}
    </li>
  );
}

export function BlockedSlotList({ blockedSlots, staffNameById }: { blockedSlots: BlockedSlot[]; staffNameById: Map<string, string> }) {
  const { run, pending, error } = useAdminAction();
  return (
    <>
      <ul>
        {blockedSlots.map((b) => (
          <li key={b.id}>
            {b.localDate} {b.startTime}–{b.endTime} — {b.staffId ? (staffNameById.get(b.staffId) ?? b.staffId) : "Todo el negocio"}
            {b.reason ? ` — ${b.reason}` : ""}{" "}
            <button disabled={pending} onClick={() => run(() => deleteBlockedSlotAction(b.id))}>
              Eliminar
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

export function BlockedSlotForm({ staff }: { staff: Staff[] }) {
  const { run, pending, error } = useAdminAction();
  const [staffId, setStaffId] = useState("");
  const [localDate, setLocalDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createBlockedSlotAction({ staffId: staffId || undefined, localDate, startTime, endTime, reason: reason || undefined }));
      }}
    >
      <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
        <option value="">Todo el negocio</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input type="date" value={localDate} onChange={(e) => setLocalDate(e.target.value)} required />
      <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
      <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
      <input type="text" placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="submit" disabled={pending}>
        Bloquear franja
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function TimeOffList({ timeOff, staffNameById }: { timeOff: TimeOff[]; staffNameById: Map<string, string> }) {
  const { run, pending, error } = useAdminAction();
  return (
    <>
      <ul>
        {timeOff.map((t) => (
          <li key={t.id}>
            {staffNameById.get(t.staffId) ?? t.staffId}: {t.startDate} – {t.endDate}
            {t.reason ? ` — ${t.reason}` : ""}{" "}
            <button disabled={pending} onClick={() => run(() => deleteTimeOffAction(t.id))}>
              Eliminar
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

export function TimeOffForm({ staff }: { staff: Staff[] }) {
  const { run, pending, error } = useAdminAction();
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createTimeOffAction({ staffId, startDate, endDate, reason: reason || undefined }));
      }}
    >
      <select value={staffId} onChange={(e) => setStaffId(e.target.value)} required>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      <input type="text" placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="submit" disabled={pending}>
        Agregar día libre
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
