import type { AiInterpretation, AiInterpretInput, AiProvider, ConversationIntent } from "./types";

/**
 * Deterministic, keyword-based interpreter — no real language understanding.
 * Exists so the whole conversational flow is demonstrable end-to-end with
 * zero external credentials (ARCHITECTURE.md §2), same role as
 * MockCrmClient/MockWhatsAppProvider. Not a promise of real NLU — a real
 * deployment always uses AnthropicAiProvider (AI_PROVIDER=anthropic).
 */

const HANDOFF_KEYWORDS = ["hablar con una persona", "hablar con alguien", "humano", "agente humano", "quiero un humano", "reclamo", "queja", "estafa", "devolución", "reembolso"];
const CANCEL_KEYWORDS = ["cancelar", "anular"];
const RESCHEDULE_KEYWORDS = ["reprogramar", "cambiar mi cita", "mover mi cita", "reagendar"];
const CONFIRM_KEYWORDS = ["si", "sí", "confirmo", "correcto", "dale", "ok", "de acuerdo"];
const DENY_KEYWORDS = ["no", "negativo", "incorrecto"];
const START_OVER_KEYWORDS = ["empezar de nuevo", "de nuevo", "reiniciar"];
const GREETING_KEYWORDS = ["hola", "buenas", "buenos días", "buenas tardes", "buenas noches"];
const BOOKING_KEYWORDS = ["cita", "reservar", "turno", "agendar", "corte"];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(normalize(n)));
}

const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function resolveLocalDate(normalizedText: string, todayLocalDate: string): string | undefined {
  if (normalizedText.includes("hoy")) return todayLocalDate;
  if (normalizedText.includes("manana")) return addDays(todayLocalDate, 1);

  const isoMatch = normalizedText.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];

  for (let i = 0; i < WEEKDAY_NAMES.length; i++) {
    if (normalizedText.includes(WEEKDAY_NAMES[i])) {
      return nextDateForWeekday(todayLocalDate, i);
    }
  }
  return undefined;
}

function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextDateForWeekday(fromLocalDate: string, targetWeekday: number): string {
  const [y, m, d] = fromLocalDate.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, d));
  const currentWeekday = from.getUTCDay();
  let delta = targetWeekday - currentWeekday;
  if (delta <= 0) delta += 7;
  return addDays(fromLocalDate, delta);
}

function resolveLocalTime(normalizedText: string): string | undefined {
  const explicit = normalizedText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (explicit) {
    const hh = explicit[1].padStart(2, "0");
    return `${hh}:${explicit[2]}`;
  }
  const looseHour = normalizedText.match(/\ba las (\d{1,2})\b/);
  if (looseHour) {
    let hour = Number(looseHour[1]);
    if (normalizedText.includes("pm") && hour < 12) hour += 12;
    return `${String(hour).padStart(2, "0")}:00`;
  }
  return undefined;
}

export class MockAiProvider implements AiProvider {
  /** Dev/test-only fault injection — see /dev/whatsapp-simulator's "simulate AI error" control. One-shot, like MockWhatsAppProvider.failNextSend. */
  failNext = false;

  async interpretMessage(input: AiInterpretInput): Promise<AiInterpretation> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("Simulated AI provider failure");
    }
    const normalized = normalize(input.messageText);

    if (containsAny(normalized, HANDOFF_KEYWORDS)) {
      return this.result("REQUEST_HUMAN", { needsHumanHandoff: true, handoffReason: "Solicitud explícita de atención humana o queja detectada.", confidence: 0.9, replyDraft: "Entiendo, te conecto con una persona del equipo." });
    }
    if (containsAny(normalized, CANCEL_KEYWORDS)) {
      return this.result("CANCEL_APPOINTMENT", { confidence: 0.85, replyDraft: "Claro, veamos qué cita tienes para cancelar." });
    }
    if (containsAny(normalized, RESCHEDULE_KEYWORDS)) {
      return this.result("RESCHEDULE_APPOINTMENT", { confidence: 0.85, replyDraft: "Claro, veamos qué cita quieres reprogramar." });
    }
    if (containsAny(normalized, START_OVER_KEYWORDS)) {
      return this.result("START_OVER", { confidence: 0.8, replyDraft: "Empecemos de nuevo." });
    }
    if (containsAny(normalized, CONFIRM_KEYWORDS)) {
      return this.result("CONFIRM", { confidence: 0.8, replyDraft: "Perfecto." });
    }
    if (containsAny(normalized, DENY_KEYWORDS)) {
      return this.result("DENY", { confidence: 0.8, replyDraft: "Entendido." });
    }

    const matchedService = input.context.services.find((s) => normalized.includes(normalize(s.name)));
    if (matchedService) {
      return this.result("SELECT_SERVICE", { serviceName: matchedService.name, confidence: 0.85, replyDraft: `Elegiste ${matchedService.name}.` });
    }

    const matchedBarber = input.context.barbers.find((b) => normalized.includes(normalize(b.name)));
    if (matchedBarber) {
      return this.result("SELECT_BARBER", { barberName: matchedBarber.name, confidence: 0.85, replyDraft: `Elegiste a ${matchedBarber.name}.` });
    }

    if (normalized.includes("cualquiera")) {
      return this.result("SELECT_BARBER", { confidence: 0.75, replyDraft: "Cualquiera disponible, entendido." });
    }

    const localDate = resolveLocalDate(normalized, input.context.todayLocalDate);
    if (localDate) {
      return this.result("SELECT_DATE", { localDate, confidence: 0.75, replyDraft: `Fecha: ${localDate}.` });
    }

    const localTime = resolveLocalTime(normalized);
    if (localTime) {
      return this.result("SELECT_TIME", { localTime, confidence: 0.75, replyDraft: `Hora: ${localTime}.` });
    }

    if (containsAny(normalized, GREETING_KEYWORDS)) {
      return this.result("GREETING", { confidence: 0.7, replyDraft: "¡Hola! Bienvenido a Esquece Barber Studio." });
    }
    if (containsAny(normalized, BOOKING_KEYWORDS)) {
      return this.result("BOOK_APPOINTMENT", { confidence: 0.65, replyDraft: "Claro, te ayudo a reservar una cita." });
    }

    // Freeform text that looks like a name (no digits, 1-4 words) — only meaningful when a name is actually expected; the orchestrator decides whether to use it.
    if (/^[a-záéíóúñ\s]{2,60}$/i.test(input.messageText.trim()) && input.messageText.trim().split(/\s+/).length <= 4) {
      return this.result("PROVIDE_NAME", { customerName: input.messageText.trim(), confidence: 0.6, replyDraft: `Gracias, ${input.messageText.trim()}.` });
    }

    return this.result("UNKNOWN", { confidence: 0.3, replyDraft: "No estoy seguro de haber entendido. ¿Podrías darme más detalles?" });
  }

  private result(intent: ConversationIntent, partial: Partial<AiInterpretation> & { confidence: number; replyDraft: string }): AiInterpretation {
    return {
      intent,
      needsHumanHandoff: false,
      ...partial,
    };
  }
}
