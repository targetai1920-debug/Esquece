import type { ConversationIntent } from "@/lib/ai/types";

/**
 * Deterministic inputs are matched before ever calling the AI provider —
 * cheaper and more reliable than a round-trip for a fixed choice
 * (WHATSAPP_AGENT_DESIGN.md §6). Covers: button/list reply ids, numeric
 * menu selections, and the fixed Spanish keywords for confirm/deny/
 * cancel/reschedule/start-over/request-human. Free-text entity extraction
 * (service/barber/date/time/name) is always the AI provider's job (real or
 * mock) — this module only recognizes exact, unambiguous inputs.
 */

export interface DeterministicMatch {
  intent: ConversationIntent;
  numericChoice?: number;
}

const HANDOFF_KEYWORDS = ["hablar con una persona", "hablar con alguien", "humano", "agente humano", "reclamo", "queja"];
const CANCEL_KEYWORDS = ["cancelar mi cita", "cancelar cita", "cancelar"];
const RESCHEDULE_KEYWORDS = ["reprogramar", "cambiar mi cita", "mover mi cita", "reagendar"];
const CONFIRM_KEYWORDS = ["si", "sí", "confirmo", "correcto", "confirmar"];
const DENY_KEYWORDS = ["no", "negativo", "incorrecto"];
const START_OVER_KEYWORDS = ["empezar de nuevo", "reiniciar"];

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

export function detectDeterministicIntent(messageText: string, interactiveReplyId?: string): DeterministicMatch | null {
  if (interactiveReplyId) {
    if (interactiveReplyId === "CONFIRM") return { intent: "CONFIRM" };
    if (interactiveReplyId === "DENY") return { intent: "DENY" };
    if (interactiveReplyId === "CANCEL_APPOINTMENT") return { intent: "CANCEL_APPOINTMENT" };
    if (interactiveReplyId === "RESCHEDULE_APPOINTMENT") return { intent: "RESCHEDULE_APPOINTMENT" };
    if (interactiveReplyId === "REQUEST_HUMAN") return { intent: "REQUEST_HUMAN" };
    // Any other button/list id (e.g. a service id, barber id) is resolved
    // by the calling state handler directly — not a global intent.
    return null;
  }

  const normalized = normalize(messageText);
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    return { intent: "UNKNOWN", numericChoice: Number(normalized) };
  }
  if (HANDOFF_KEYWORDS.some((k) => normalized.includes(k))) return { intent: "REQUEST_HUMAN" };
  if (CANCEL_KEYWORDS.some((k) => normalized.includes(k))) return { intent: "CANCEL_APPOINTMENT" };
  if (RESCHEDULE_KEYWORDS.some((k) => normalized.includes(k))) return { intent: "RESCHEDULE_APPOINTMENT" };
  if (START_OVER_KEYWORDS.some((k) => normalized.includes(k))) return { intent: "START_OVER" };
  if (CONFIRM_KEYWORDS.includes(normalized)) return { intent: "CONFIRM" };
  if (DENY_KEYWORDS.includes(normalized)) return { intent: "DENY" };

  return null;
}
