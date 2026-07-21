import "server-only";
import type { AiInterpretation, AiProvider } from "@/lib/ai/types";
import type { Appointment, AvailableSlot, Conversation, ConversationState, Customer, CrmClient, Service } from "@/lib/crm/types";
import { CrmError } from "@/lib/crm/errors";
import type { WhatsAppProvider } from "@/lib/whatsapp/types";
import { logger } from "@/lib/logging/logger";
import { detectDeterministicIntent } from "./deterministicIntent";
import { isLegalTransition } from "./transitions";
import type { BookingScratchData, ConversationTurnOutcome } from "./types";

/**
 * The conversation turn orchestrator — the one place that ties CRM + AI +
 * WhatsApp together for the booking/cancel/reschedule flows
 * (WHATSAPP_AGENT_DESIGN.md §5-§9, master spec §14-§19). Claude (or the
 * mock) only ever interprets; every CRM mutation, every state transition,
 * and every outbound send happens here, in code — never inside the AI
 * provider (ARCHITECTURE.md §7).
 */

export interface OrchestratorDeps {
  crm: CrmClient;
  ai: AiProvider;
  whatsapp: WhatsAppProvider;
}

export interface InboundTurnInput {
  phoneE164: string;
  externalMessageId: string;
  messageType: string;
  messageText: string;
  interactiveReplyId?: string;
  /** Contact display name, if the channel supplied one (e.g. Meta's contacts[].profile.name) — lets a first-time customer skip REQUESTING_NAME. */
  contactName?: string;
}

function parseScratch(json: string | null | undefined): BookingScratchData {
  if (!json) return {};
  try {
    return JSON.parse(json) as BookingScratchData;
  } catch {
    return {};
  }
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function todayLocalDate(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function isSessionExpired(conversation: Conversation, sessionTimeoutMinutes: number): boolean {
  if (!conversation.lastInboundMessageAt) return false;
  const last = new Date(conversation.lastInboundMessageAt).getTime();
  return Date.now() - last > sessionTimeoutMinutes * 60_000;
}

/** Sends the reply (best-effort — a WhatsApp send failure never blocks a state change a real CRM mutation already depends on) and commits the turn. */
async function commitTurnWithReply(
  crm: CrmClient,
  whatsapp: WhatsAppProvider,
  conversation: Conversation,
  phoneE164: string,
  patch: { newState?: ConversationState; newScratchData?: BookingScratchData },
  replyText: string,
): Promise<Conversation> {
  if (patch.newState && !isLegalTransition(conversation.state, patch.newState)) {
    logger.error("Illegal conversation transition attempted — aborting turn", { from: conversation.state, to: patch.newState });
    throw new Error(`Illegal conversation transition ${conversation.state} -> ${patch.newState}`);
  }
  try {
    await whatsapp.sendText(phoneE164, replyText);
  } catch (err) {
    logger.error("WhatsApp send failed (conversation state still committed)", { error: err instanceof Error ? err.message : String(err) });
  }
  return crm.applyConversationTurn({
    conversationId: conversation.conversationId,
    expectedVersion: conversation.version,
    newState: patch.newState,
    newScratchData: patch.newScratchData as Record<string, unknown> | undefined,
    outboundMessage: { messageType: "text", body: replyText },
  });
}

async function activateHandoff(crm: CrmClient, whatsapp: WhatsAppProvider, conversation: Conversation, phoneE164: string, reason: string): Promise<ConversationTurnOutcome> {
  await crm.activateHumanHandoff({ conversationId: conversation.conversationId, reason });
  const notice = "Te voy a conectar con una persona de nuestro equipo, en breve te atienden por aquí mismo.";
  try {
    await whatsapp.sendText(phoneE164, notice);
  } catch (err) {
    logger.error("WhatsApp send failed for handoff notice", { error: err instanceof Error ? err.message : String(err) });
  }
  await crm.createNotification({ conversationId: conversation.conversationId, type: "INTERNAL_ALERT", channel: "admin" });
  return { conversationId: conversation.conversationId, state: "HUMAN_HANDOFF", replySent: true };
}

function formatServiceList(services: Service[]): string {
  return services.map((s, i) => `${i + 1}. ${s.name} — ${s.durationMinutes} min, ${s.price} ${s.currency}`).join("\n");
}

function formatSlotList(slots: AvailableSlot[]): string {
  return slots.slice(0, 20).map((s, i) => `${i + 1}. ${s.localStartTime}`).join("\n");
}

function bookingSummary(scratch: BookingScratchData, barberName: string): string {
  return [
    `Servicio: ${scratch.serviceName}`,
    `Barbero: ${barberName}`,
    `Fecha: ${scratch.localDate}`,
    `Hora: ${scratch.localTime}`,
    `Nombre: ${scratch.customerName}`,
  ].join("\n");
}

async function findChangeableAppointments(crm: CrmClient, customer: Customer): Promise<Appointment[]> {
  const all = await crm.listCustomerAppointments(customer.customerId);
  return all.filter((a) => a.status === "PENDING" || a.status === "CONFIRMED");
}

export async function handleInboundTurn(deps: OrchestratorDeps, input: InboundTurnInput): Promise<ConversationTurnOutcome> {
  const { crm, ai, whatsapp } = deps;
  const phoneE164 = input.phoneE164;

  const settings = await crm.getBusinessSettings();
  const customer = await crm.upsertCustomer({ phoneE164, name: input.contactName, source: "WHATSAPP" });
  let conversation = await crm.getOrCreateConversation(phoneE164);

  // Session expiry never applies to an active handoff (§4/§8).
  if (conversation.state !== "HUMAN_HANDOFF" && isSessionExpired(conversation, Number(settings.SESSION_TIMEOUT_MINUTES) || 60)) {
    conversation = await crm.applyConversationTurn({
      conversationId: conversation.conversationId,
      expectedVersion: conversation.version,
      newState: "IDLE",
      newScratchData: {},
    });
  }

  // Every inbound message is recorded, even during an active handoff (§3/§8).
  conversation = await crm.applyConversationTurn({
    conversationId: conversation.conversationId,
    expectedVersion: conversation.version,
    inboundMessage: { externalMessageId: input.externalMessageId, messageType: input.messageType, body: input.messageText },
  });

  if (conversation.humanHandoffActive) {
    return { conversationId: conversation.conversationId, state: conversation.state, replySent: false };
  }

  const scratch = parseScratch(conversation.scratchDataJson);
  const [services, barbers] = await Promise.all([crm.listServices(), crm.listBarbers()]);
  const today = todayLocalDate(settings.BUSINESS_TIMEZONE);

  const deterministic = detectDeterministicIntent(input.messageText, input.interactiveReplyId);
  const numericChoice = deterministic?.numericChoice;

  let interpretation: AiInterpretation;
  if (deterministic && deterministic.intent !== "UNKNOWN") {
    interpretation = { intent: deterministic.intent, confidence: 1, needsHumanHandoff: false, replyDraft: "" };
  } else if (numericChoice !== undefined) {
    interpretation = { intent: "UNKNOWN", confidence: 1, needsHumanHandoff: false, replyDraft: "" };
  } else {
    interpretation = await ai.interpretMessage({
      conversationState: conversation.state,
      scratchData: scratch as Record<string, unknown>,
      messageText: input.messageText,
      context: {
        services: services.map((s) => ({ serviceId: s.serviceId, name: s.name })),
        barbers: barbers.map((b) => ({ barberId: b.barberId, name: b.name })),
        todayLocalDate: today,
      },
    });
  }

  // Global intents (§6/§19) — recognized regardless of state, except while
  // already inside the flow they'd trigger (avoids re-triggering a cancel
  // flow from within the cancel flow's own confirmation step, etc.).
  if (interpretation.needsHumanHandoff || interpretation.intent === "REQUEST_HUMAN" || interpretation.intent === "COMPLAINT") {
    return activateHandoff(crm, whatsapp, conversation, phoneE164, interpretation.handoffReason || "Solicitud del cliente o posible queja detectada.");
  }
  if (interpretation.intent === "CANCEL_APPOINTMENT" && conversation.state !== "CANCELLING_BOOKING" && scratch.flow !== "cancel") {
    conversation = await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "CANCELLING_BOOKING", newScratchData: { ...scratch, flow: "cancel" } }, "Claro, veamos tus próximas citas.");
    return dispatch(crm, whatsapp, conversation, customer, { ...scratch, flow: "cancel" }, interpretation, numericChoice, input, services, barbers);
  }
  if (interpretation.intent === "RESCHEDULE_APPOINTMENT" && conversation.state !== "RESCHEDULING_BOOKING" && scratch.flow !== "reschedule") {
    conversation = await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "RESCHEDULING_BOOKING", newScratchData: { ...scratch, flow: "reschedule" } }, "Claro, veamos tus próximas citas.");
    return dispatch(crm, whatsapp, conversation, customer, { ...scratch, flow: "reschedule" }, interpretation, numericChoice, input, services, barbers);
  }
  if (interpretation.intent === "START_OVER") {
    const reply = services.length ? `Empecemos de nuevo. Estos son nuestros servicios:\n${formatServiceList(services)}` : "Empecemos de nuevo.";
    conversation = await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: services.length ? "SELECTING_SERVICE" : "IDLE", newScratchData: { flow: "booking" } }, reply);
    return { conversationId: conversation.conversationId, state: conversation.state, replySent: true };
  }

  return dispatch(crm, whatsapp, conversation, customer, scratch, interpretation, numericChoice, input, services, barbers);
}

async function dispatch(
  crm: CrmClient,
  whatsapp: WhatsAppProvider,
  conversation: Conversation,
  customer: Customer,
  scratch: BookingScratchData,
  interpretation: AiInterpretation,
  numericChoice: number | undefined,
  input: InboundTurnInput,
  services: Service[],
  barbers: { barberId: string; name: string }[],
): Promise<ConversationTurnOutcome> {
  const phoneE164 = input.phoneE164;

  switch (conversation.state) {
    case "IDLE": {
      if (interpretation.intent === "GREETING" || interpretation.intent === "BOOK_APPOINTMENT" || interpretation.intent === "UNKNOWN") {
        if (services.length === 0) {
          return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, {}, "Por el momento no tenemos servicios disponibles para reservar por aquí."));
        }
        const conv = await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "SELECTING_SERVICE", newScratchData: { flow: "booking" } }, `¡Hola! Estos son nuestros servicios:\n${formatServiceList(services)}\n\nResponde con el nombre o el número del servicio que quieres.`);
        return finish(conv);
      }
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, {}, "Puedo ayudarte a reservar, cancelar o reprogramar una cita. ¿Qué te gustaría hacer?"));
    }

    case "SELECTING_SERVICE": {
      let matched: Service | undefined;
      if (numericChoice && services[numericChoice - 1]) matched = services[numericChoice - 1];
      else if (interpretation.serviceName) {
        matched = services.find((s) => normalize(s.name) === normalize(interpretation.serviceName!)) || services.find((s) => normalize(s.name).includes(normalize(interpretation.serviceName!)));
      }
      if (!matched) {
        return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, {}, `No reconocí ese servicio. Elige uno de la lista:\n${formatServiceList(services)}`));
      }
      const eligibleBarbers = await crm.listBarbersForService(matched.serviceId);
      const barberList = eligibleBarbers.map((b, i) => `${i + 1}. ${b.name}`).join("\n");
      const newScratch: BookingScratchData = { ...scratch, serviceId: matched.serviceId, serviceName: matched.name };
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "SELECTING_BARBER", newScratchData: newScratch }, `Elegiste ${matched.name}. ¿Con qué barbero prefieres?\n${barberList}\n0. Cualquiera disponible`));
    }

    case "SELECTING_BARBER": {
      const eligibleBarbers = await crm.listBarbersForService(scratch.serviceId!);
      let anyBarber = false;
      let barberId: string | undefined;
      if (numericChoice === 0) anyBarber = true;
      else if (numericChoice && eligibleBarbers[numericChoice - 1]) barberId = eligibleBarbers[numericChoice - 1].barberId;
      else if (interpretation.barberName) {
        const m = eligibleBarbers.find((b) => normalize(b.name).includes(normalize(interpretation.barberName!)));
        if (m) barberId = m.barberId;
      } else if (interpretation.intent === "SELECT_BARBER") {
        anyBarber = true;
      }
      if (!anyBarber && !barberId) {
        return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, {}, `No reconocí ese barbero. Elige uno:\n${eligibleBarbers.map((b, i) => `${i + 1}. ${b.name}`).join("\n")}\n0. Cualquiera disponible`));
      }
      const newScratch: BookingScratchData = { ...scratch, anyBarber, barberId };
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "SELECTING_DATE", newScratchData: newScratch }, "¿Para qué fecha te gustaría la cita?"));
    }

    case "SELECTING_DATE": {
      if (!interpretation.localDate) {
        return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, {}, "No entendí la fecha. ¿Podrías indicarla de nuevo? (por ejemplo, mañana, el lunes, o 2026-08-05)"));
      }
      const slots = await crm.getAvailability({ serviceId: scratch.serviceId!, localDate: interpretation.localDate, barberId: scratch.anyBarber ? undefined : scratch.barberId, anyBarber: scratch.anyBarber });
      if (slots.length === 0) {
        return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, {}, "No tenemos horarios disponibles ese día (puede que estemos cerrados o ya esté completo). ¿Quieres probar otra fecha?"));
      }
      const newScratch: BookingScratchData = { ...scratch, localDate: interpretation.localDate };
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "SELECTING_TIME", newScratchData: newScratch }, `Estos son los horarios disponibles para el ${interpretation.localDate}:\n${formatSlotList(slots)}\n\nResponde con el número o la hora que prefieras.`));
    }

    case "SELECTING_TIME": {
      const slots = await crm.getAvailability({ serviceId: scratch.serviceId!, localDate: scratch.localDate!, barberId: scratch.anyBarber ? undefined : scratch.barberId, anyBarber: scratch.anyBarber });
      let chosen: AvailableSlot | undefined;
      if (numericChoice && slots[numericChoice - 1]) chosen = slots[numericChoice - 1];
      else if (interpretation.localTime) chosen = slots.find((s) => s.localStartTime === interpretation.localTime);
      if (!chosen) {
        return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, {}, `No reconocí ese horario. Elige uno:\n${formatSlotList(slots)}`));
      }
      const barberId = scratch.anyBarber ? chosen.barberIds[0] : scratch.barberId;
      const newScratch: BookingScratchData = { ...scratch, localTime: chosen.localStartTime, barberId };

      if (scratch.flow === "reschedule") {
        const barberName = barbers.find((b) => b.barberId === barberId)?.name || "";
        return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "AWAITING_CONFIRMATION", newScratchData: newScratch }, `¿Confirmas cambiar tu cita al ${scratch.localDate} a las ${chosen.localStartTime} con ${barberName}? Responde sí o no.`));
      }

      const knownName = scratch.customerName || customer.name;
      if (knownName) {
        newScratch.customerName = knownName;
        const barberName = barbers.find((b) => b.barberId === barberId)?.name || "";
        return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "AWAITING_CONFIRMATION", newScratchData: newScratch }, `Resumen de tu cita:\n${bookingSummary(newScratch, barberName)}\n\n¿Confirmas? Responde sí o no.`));
      }
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "REQUESTING_NAME", newScratchData: newScratch }, "¿A nombre de quién hacemos la reserva?"));
    }

    case "REQUESTING_NAME": {
      const name = (interpretation.customerName || input.messageText).trim();
      if (!name || name.length < 2) {
        return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, {}, "¿Podrías indicarme el nombre para la reserva?"));
      }
      const newScratch: BookingScratchData = { ...scratch, customerName: name };
      const barberName = barbers.find((b) => b.barberId === newScratch.barberId)?.name || "";
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "AWAITING_CONFIRMATION", newScratchData: newScratch }, `Resumen de tu cita:\n${bookingSummary(newScratch, barberName)}\n\n¿Confirmas? Responde sí o no.`));
    }

    case "REVIEWING_BOOKING":
    case "AWAITING_CONFIRMATION":
      return handleAwaitingConfirmation(crm, whatsapp, conversation, customer, scratch, interpretation, phoneE164, services);

    case "BOOKING_CONFIRMED": {
      const reset = await crm.applyConversationTurn({ conversationId: conversation.conversationId, expectedVersion: conversation.version, newState: "IDLE", newScratchData: {} });
      return dispatch(crm, whatsapp, reset, customer, {}, interpretation, numericChoice, input, services, barbers);
    }

    case "CANCELLING_BOOKING":
      return handleCancellingBooking(crm, whatsapp, conversation, customer, scratch, numericChoice, phoneE164);

    case "RESCHEDULING_BOOKING":
      return handleReschedulingBooking(crm, whatsapp, conversation, customer, scratch, numericChoice, phoneE164);

    case "HUMAN_HANDOFF":
      return { conversationId: conversation.conversationId, state: conversation.state, replySent: false };

    default:
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "IDLE" }, "¿En qué puedo ayudarte?"));
  }
}

async function handleAwaitingConfirmation(
  crm: CrmClient,
  whatsapp: WhatsAppProvider,
  conversation: Conversation,
  customer: Customer,
  scratch: BookingScratchData,
  interpretation: AiInterpretation,
  phoneE164: string,
  services: Service[],
): Promise<ConversationTurnOutcome> {
  if (interpretation.intent === "DENY") {
    if (scratch.flow === "cancel" || scratch.flow === "reschedule") {
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "IDLE", newScratchData: {} }, "Entendido, no se hizo ningún cambio a tu cita."));
    }
    return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "SELECTING_SERVICE", newScratchData: { flow: "booking" } }, `Sin problema, empecemos de nuevo con el servicio:\n${formatServiceList(services)}`));
  }

  if (interpretation.intent !== "CONFIRM") {
    return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, {}, "¿Confirmas? Responde sí o no."));
  }

  if (scratch.flow === "cancel") {
    try {
      await crm.cancelAppointment({ appointmentId: scratch.targetAppointmentId!, actor: { type: "system", id: customer.customerId }, reason: "Cancelado por el cliente vía WhatsApp" });
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "IDLE", newScratchData: {} }, "Listo, tu cita fue cancelada."));
    } catch (err) {
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "IDLE", newScratchData: {} }, safeErrorMessage(err, "No pude cancelar la cita.")));
    }
  }

  if (scratch.flow === "reschedule") {
    try {
      await crm.rescheduleAppointment({ appointmentId: scratch.targetAppointmentId!, actor: { type: "system", id: customer.customerId }, newLocalDate: scratch.localDate!, newLocalStartTime: scratch.localTime! });
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "IDLE", newScratchData: {} }, `Listo, tu cita fue reprogramada para el ${scratch.localDate} a las ${scratch.localTime}.`));
    } catch (err) {
      if (err instanceof CrmError && err.code === "SLOT_UNAVAILABLE") {
        return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "SELECTING_DATE", newScratchData: { ...scratch, localTime: undefined } }, "Ese horario ya no está disponible. ¿Para qué otra fecha te gustaría reprogramar?"));
      }
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "IDLE", newScratchData: {} }, safeErrorMessage(err, "No pude reprogramar la cita.")));
    }
  }

  // Booking flow — create the appointment. Never confirmed to the customer before the CRM write succeeds (ARCHITECTURE.md §4).
  const idempotencyKey = `wa_${conversation.conversationId}_${scratch.serviceId}_${scratch.localDate}_${scratch.localTime}_${scratch.barberId || "any"}`;
  try {
    const result = await crm.createAppointment({
      idempotencyKey,
      source: "WHATSAPP",
      serviceId: scratch.serviceId!,
      barberId: scratch.anyBarber ? undefined : scratch.barberId,
      anyBarber: scratch.anyBarber,
      localDate: scratch.localDate!,
      localStartTime: scratch.localTime!,
      customer: { name: scratch.customerName!, phoneE164 },
    });
    return finish(await commitTurnWithReply(
      crm, whatsapp, conversation, phoneE164,
      { newState: "BOOKING_CONFIRMED", newScratchData: {} },
      `¡Listo! Tu cita quedó confirmada.\nReferencia: ${result.appointment.reference}\n${scratch.serviceName} el ${scratch.localDate} a las ${scratch.localTime}.`,
    ));
  } catch (err) {
    if (err instanceof CrmError && err.code === "SLOT_UNAVAILABLE") {
      const freshSlots = await crm.getAvailability({ serviceId: scratch.serviceId!, localDate: scratch.localDate!, barberId: scratch.anyBarber ? undefined : scratch.barberId, anyBarber: scratch.anyBarber });
      if (freshSlots.length === 0) {
        return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "SELECTING_DATE", newScratchData: { ...scratch, localTime: undefined } }, "Ese horario se acaba de ocupar y no quedan más ese día. ¿Para qué otra fecha te gustaría?"));
      }
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "SELECTING_TIME", newScratchData: { ...scratch, localTime: undefined } }, `Ese horario se acaba de ocupar. Aquí tienes otros disponibles el mismo día:\n${formatSlotList(freshSlots)}`));
    }
    return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "IDLE", newScratchData: {} }, safeErrorMessage(err, "No pude completar la reserva.")));
  }
}

async function handleCancellingBooking(
  crm: CrmClient,
  whatsapp: WhatsAppProvider,
  conversation: Conversation,
  customer: Customer,
  scratch: BookingScratchData,
  numericChoice: number | undefined,
  phoneE164: string,
): Promise<ConversationTurnOutcome> {
  if (scratch.candidateAppointmentIds?.length && numericChoice) {
    const chosenId = scratch.candidateAppointmentIds[numericChoice - 1];
    if (chosenId) {
      const appt = await crm.getAppointment({ appointmentId: chosenId });
      const newScratch: BookingScratchData = { ...scratch, targetAppointmentId: appt.appointmentId, targetAppointmentReference: appt.reference, candidateAppointmentIds: undefined };
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "AWAITING_CONFIRMATION", newScratchData: newScratch }, `${appt.serviceNameSnapshot} el ${appt.localDate} a las ${appt.localStartTime} con ${appt.barberNameSnapshot}.\n\n¿Confirmas la cancelación? Responde sí o no.`));
    }
  }

  const candidates = await findChangeableAppointments(crm, customer);
  if (candidates.length === 0) {
    return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "IDLE", newScratchData: {} }, "No encontré citas próximas para cancelar."));
  }
  if (candidates.length === 1) {
    const appt = candidates[0];
    const newScratch: BookingScratchData = { ...scratch, targetAppointmentId: appt.appointmentId, targetAppointmentReference: appt.reference };
    return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "AWAITING_CONFIRMATION", newScratchData: newScratch }, `${appt.serviceNameSnapshot} el ${appt.localDate} a las ${appt.localStartTime} con ${appt.barberNameSnapshot}.\n\n¿Confirmas la cancelación? Responde sí o no.`));
  }
  const list = candidates.map((a, i) => `${i + 1}. ${a.localDate} ${a.localStartTime} — ${a.serviceNameSnapshot}`).join("\n");
  const newScratch: BookingScratchData = { ...scratch, candidateAppointmentIds: candidates.map((a) => a.appointmentId) };
  return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newScratchData: newScratch }, `Tienes varias citas próximas, ¿cuál deseas cancelar?\n${list}`));
}

async function handleReschedulingBooking(
  crm: CrmClient,
  whatsapp: WhatsAppProvider,
  conversation: Conversation,
  customer: Customer,
  scratch: BookingScratchData,
  numericChoice: number | undefined,
  phoneE164: string,
): Promise<ConversationTurnOutcome> {
  if (scratch.candidateAppointmentIds?.length && numericChoice) {
    const chosenId = scratch.candidateAppointmentIds[numericChoice - 1];
    if (chosenId) {
      const appt = await crm.getAppointment({ appointmentId: chosenId });
      const newScratch: BookingScratchData = {
        flow: "reschedule",
        targetAppointmentId: appt.appointmentId,
        targetAppointmentReference: appt.reference,
        serviceId: appt.serviceId,
        serviceName: appt.serviceNameSnapshot,
        barberId: appt.barberId,
        anyBarber: false,
      };
      return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "SELECTING_DATE", newScratchData: newScratch }, `¿Para qué fecha quieres reprogramar tu cita de ${appt.serviceNameSnapshot}?`));
    }
  }

  const candidates = await findChangeableAppointments(crm, customer);
  if (candidates.length === 0) {
    return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "IDLE", newScratchData: {} }, "No encontré citas próximas para reprogramar."));
  }
  if (candidates.length === 1) {
    const appt = candidates[0];
    const newScratch: BookingScratchData = {
      flow: "reschedule",
      targetAppointmentId: appt.appointmentId,
      targetAppointmentReference: appt.reference,
      serviceId: appt.serviceId,
      serviceName: appt.serviceNameSnapshot,
      barberId: appt.barberId,
      anyBarber: false,
    };
    return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newState: "SELECTING_DATE", newScratchData: newScratch }, `¿Para qué fecha quieres reprogramar tu cita de ${appt.serviceNameSnapshot}?`));
  }
  const list = candidates.map((a, i) => `${i + 1}. ${a.localDate} ${a.localStartTime} — ${a.serviceNameSnapshot}`).join("\n");
  const newScratch: BookingScratchData = { ...scratch, candidateAppointmentIds: candidates.map((a) => a.appointmentId) };
  return finish(await commitTurnWithReply(crm, whatsapp, conversation, phoneE164, { newScratchData: newScratch }, `Tienes varias citas próximas, ¿cuál deseas reprogramar?\n${list}`));
}

function safeErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof CrmError) return err.message;
  return fallback;
}

function finish(conversation: Conversation): ConversationTurnOutcome {
  return { conversationId: conversation.conversationId, state: conversation.state, replySent: true };
}
