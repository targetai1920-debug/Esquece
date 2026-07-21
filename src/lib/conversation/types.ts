import type { ConversationState } from "@/lib/crm/types";

/**
 * Structured scratch data persisted as JSON on the CONVERSATIONS row
 * (`scratchDataJson`). Never reconstructed from message history — this is
 * the only in-progress booking/cancel/reschedule state that survives
 * across turns (WHATSAPP_AGENT_DESIGN.md §4/§7).
 */
export interface BookingScratchData {
  /** Which flow the shared SELECTING_DATE/SELECTING_TIME/AWAITING_CONFIRMATION states are serving. */
  flow?: "booking" | "cancel" | "reschedule";
  serviceId?: string;
  serviceName?: string;
  barberId?: string;
  anyBarber?: boolean;
  localDate?: string;
  localTime?: string;
  customerName?: string;
  /** cancel/reschedule: the appointment being acted on, once resolved. */
  targetAppointmentId?: string;
  targetAppointmentReference?: string;
  /** cancel/reschedule: candidates shown to the customer while asking "which one?". */
  candidateAppointmentIds?: string[];
}

export interface ConversationTurnOutcome {
  conversationId: string;
  state: ConversationState;
  replySent: boolean;
}
