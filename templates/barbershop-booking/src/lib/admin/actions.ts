"use server";

import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "./session";
import { getCrmClient } from "@/lib/crm/factory";
import { CrmError } from "@/lib/crm/errors";

/**
 * Server Actions backing the admin dashboard's day-to-day operations —
 * see .claude/skills/barbershop-crm-builder/references/admin-dashboard.md.
 *
 * Auth + CSRF: every action re-checks the admin session cookie itself
 * (never trusts that only the dashboard page can call it). Next.js Server
 * Actions already reject any POST whose Origin header doesn't match the
 * request's Host header by default — no separate CSRF token is layered on
 * top; this is the origin-check equivalent the task asked for. If this
 * project is ever deployed behind a reverse proxy that changes the Host
 * header, add `experimental.serverActions.allowedOrigins` in
 * next.config.ts — see the Next.js Server Actions security docs.
 *
 * Idempotency: these are direct admin state transitions (confirm/cancel/
 * toggle), not retried commercial operations like booking creation — a
 * duplicate click reapplies the same target state rather than creating a
 * duplicate side effect (e.g. cancelling an already-cancelled appointment
 * is a no-op both in LocalCrmClient and the Apps Script backend).
 *
 * Audit: every mutation below is already recorded by the CrmClient
 * implementation itself (LocalCrmClient.audit(...) / Apps Script's
 * writeAuditEntry_ inside each actionAdmin*_ handler) — this layer does
 * not duplicate that logging, only input validation and auth.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

async function runAdminMutation(mutate: () => Promise<unknown>): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: "No autorizado. Inicia sesión nuevamente." };
  }
  try {
    await mutate();
    revalidatePath("/admin");
    return { ok: true };
  } catch (err) {
    if (err instanceof CrmError) return { ok: false, error: err.message };
    return { ok: false, error: "No se pudo completar la operación." };
  }
}

const appointmentIdSchema = z.string().min(1);

export async function confirmAppointmentAction(appointmentId: string): Promise<ActionResult> {
  const id = appointmentIdSchema.safeParse(appointmentId);
  if (!id.success) return { ok: false, error: "ID de cita inválido." };
  return runAdminMutation(() => getCrmClient().confirmAppointment(id.data));
}

export async function completeAppointmentAction(appointmentId: string): Promise<ActionResult> {
  const id = appointmentIdSchema.safeParse(appointmentId);
  if (!id.success) return { ok: false, error: "ID de cita inválido." };
  return runAdminMutation(() => getCrmClient().completeAppointment(id.data));
}

export async function markNoShowAction(appointmentId: string): Promise<ActionResult> {
  const id = appointmentIdSchema.safeParse(appointmentId);
  if (!id.success) return { ok: false, error: "ID de cita inválido." };
  return runAdminMutation(() => getCrmClient().markNoShow(id.data));
}

const adminCancelSchema = z.object({
  appointmentId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function adminCancelAppointmentAction(input: { appointmentId: string; reason?: string }): Promise<ActionResult> {
  const parsed = adminCancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos de cancelación inválidos." };
  return runAdminMutation(() => getCrmClient().adminCancelAppointment(parsed.data.appointmentId, parsed.data.reason));
}

const adminRescheduleSchema = z.object({
  appointmentId: z.string().min(1),
  newLocalDate: z.string().regex(localDatePattern),
  newLocalStartTime: z.string().regex(localTimePattern),
});

export async function adminRescheduleAppointmentAction(input: {
  appointmentId: string;
  newLocalDate: string;
  newLocalStartTime: string;
}): Promise<ActionResult> {
  const parsed = adminRescheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos de reprogramación inválidos." };
  return runAdminMutation(() =>
    getCrmClient().adminRescheduleAppointment(parsed.data.appointmentId, parsed.data.newLocalDate, parsed.data.newLocalStartTime),
  );
}

const createBlockedSlotSchema = z.object({
  staffId: z.string().min(1).optional(),
  localDate: z.string().regex(localDatePattern),
  startTime: z.string().regex(localTimePattern),
  endTime: z.string().regex(localTimePattern),
  reason: z.string().max(500).optional(),
});

export async function createBlockedSlotAction(input: {
  staffId?: string;
  localDate: string;
  startTime: string;
  endTime: string;
  reason?: string;
}): Promise<ActionResult> {
  const parsed = createBlockedSlotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos de bloqueo inválidos." };
  return runAdminMutation(() => getCrmClient().createBlockedSlot(parsed.data));
}

export async function deleteBlockedSlotAction(id: string): Promise<ActionResult> {
  const parsed = appointmentIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "ID de bloqueo inválido." };
  return runAdminMutation(() => getCrmClient().deleteBlockedSlot(parsed.data));
}

const createTimeOffSchema = z.object({
  staffId: z.string().min(1),
  startDate: z.string().regex(localDatePattern),
  endDate: z.string().regex(localDatePattern),
  reason: z.string().max(500).optional(),
});

export async function createTimeOffAction(input: {
  staffId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}): Promise<ActionResult> {
  const parsed = createTimeOffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos de día libre inválidos." };
  return runAdminMutation(() => getCrmClient().createTimeOff(parsed.data));
}

export async function deleteTimeOffAction(id: string): Promise<ActionResult> {
  const parsed = appointmentIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: "ID de día libre inválido." };
  return runAdminMutation(() => getCrmClient().deleteTimeOff(parsed.data));
}

const setServiceActiveSchema = z.object({ serviceId: z.string().min(1), active: z.boolean() });

export async function setServiceActiveAction(input: { serviceId: string; active: boolean }): Promise<ActionResult> {
  const parsed = setServiceActiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos de servicio inválidos." };
  return runAdminMutation(() => getCrmClient().adminSetServiceActive(parsed.data.serviceId, parsed.data.active));
}

const setServicePriceSchema = z.object({ serviceId: z.string().min(1), price: z.number().positive().finite() });

export async function setServicePriceAction(input: { serviceId: string; price: number }): Promise<ActionResult> {
  const parsed = setServicePriceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Precio inválido." };
  return runAdminMutation(() => getCrmClient().adminSetServicePrice(parsed.data.serviceId, parsed.data.price));
}

const setStaffActiveSchema = z.object({ staffId: z.string().min(1), active: z.boolean() });

export async function setStaffActiveAction(input: { staffId: string; active: boolean }): Promise<ActionResult> {
  const parsed = setStaffActiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos de personal inválidos." };
  return runAdminMutation(() => getCrmClient().adminSetStaffActive(parsed.data.staffId, parsed.data.active));
}
