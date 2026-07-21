import type { ConversationState } from "@/lib/crm/types";

/**
 * Legal (fromState -> toState) pairs — WHATSAPP_AGENT_DESIGN.md §5. The
 * orchestrator's per-state handlers decide *which* transition to take, but
 * every transition they produce is checked here before being committed —
 * a handler bug that tries an illegal jump is caught instead of silently
 * corrupting conversation state. `HUMAN_HANDOFF` is reachable from any
 * state (global override); leaving it is only ever a manual admin action
 * (`resolveHumanHandoff`), never a transition this table allows the
 * orchestrator itself to take back to another state.
 */
const ALLOWED_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  IDLE: ["IDLE", "SELECTING_SERVICE", "CANCELLING_BOOKING", "RESCHEDULING_BOOKING"],
  SELECTING_SERVICE: ["SELECTING_SERVICE", "SELECTING_BARBER", "IDLE"],
  SELECTING_BARBER: ["SELECTING_BARBER", "SELECTING_DATE", "SELECTING_SERVICE", "IDLE"],
  SELECTING_DATE: ["SELECTING_DATE", "SELECTING_TIME", "IDLE"],
  SELECTING_TIME: ["SELECTING_TIME", "REQUESTING_NAME", "AWAITING_CONFIRMATION", "SELECTING_DATE", "IDLE"],
  REQUESTING_NAME: ["REQUESTING_NAME", "REVIEWING_BOOKING", "AWAITING_CONFIRMATION", "IDLE"],
  REVIEWING_BOOKING: ["REVIEWING_BOOKING", "AWAITING_CONFIRMATION", "SELECTING_SERVICE", "IDLE"],
  AWAITING_CONFIRMATION: ["AWAITING_CONFIRMATION", "BOOKING_CONFIRMED", "SELECTING_SERVICE", "SELECTING_TIME", "IDLE"],
  BOOKING_CONFIRMED: ["IDLE", "SELECTING_SERVICE", "CANCELLING_BOOKING", "RESCHEDULING_BOOKING"],
  CANCELLING_BOOKING: ["CANCELLING_BOOKING", "AWAITING_CONFIRMATION", "IDLE"],
  RESCHEDULING_BOOKING: ["RESCHEDULING_BOOKING", "SELECTING_DATE", "IDLE"],
  HUMAN_HANDOFF: ["HUMAN_HANDOFF"],
};

/** Every non-handoff state may always jump straight to HUMAN_HANDOFF (global override, §5/§19). */
export function isLegalTransition(from: ConversationState, to: ConversationState): boolean {
  if (to === "HUMAN_HANDOFF") return from !== "HUMAN_HANDOFF";
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
