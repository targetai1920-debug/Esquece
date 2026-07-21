/**
 * Claude's structured-output contract for one conversation turn —
 * ARCHITECTURE.md §7 / WHATSAPP_AGENT_DESIGN.md. The AI only ever
 * *interprets* the customer's message against data the orchestrator
 * already fetched from the CRM (services/barbers) and today's real date;
 * it never invents a service, barber, price, or availability, and it never
 * mutates conversation state or CRM data directly — see master spec §14
 * "Claude may not" list, enforced entirely outside this interface (the
 * orchestrator is the only thing that calls CrmClient mutations).
 */

export type ConversationIntent =
  | "GREETING"
  | "BOOK_APPOINTMENT"
  | "SELECT_SERVICE"
  | "SELECT_BARBER"
  | "SELECT_DATE"
  | "SELECT_TIME"
  | "PROVIDE_NAME"
  | "CONFIRM"
  | "DENY"
  | "CANCEL_APPOINTMENT"
  | "RESCHEDULE_APPOINTMENT"
  | "REQUEST_HUMAN"
  | "COMPLAINT"
  | "FAQ_QUESTION"
  | "START_OVER"
  | "UNKNOWN";

export interface AiInterpretation {
  intent: ConversationIntent;
  /** Free-text service name as the customer wrote it — the orchestrator resolves it against the real CRM service list; the AI does not decide which service id this is. */
  serviceName?: string;
  barberName?: string;
  /** Best-effort YYYY-MM-DD extraction (e.g. "mañana", "el lunes" resolved using todayLocalDate supplied in the input) — always re-validated by CRM getAvailability/validateSlot before use, never trusted as authoritative. */
  localDate?: string;
  localTime?: string;
  customerName?: string;
  confidence: number;
  needsHumanHandoff: boolean;
  handoffReason?: string;
  /** Suggested Spanish reply text — the orchestrator may use it verbatim, adapt it, or replace it entirely with a deterministic message; this is a draft, not a command. */
  replyDraft: string;
}

export interface AiInterpretInput {
  conversationState: string;
  scratchData: Record<string, unknown>;
  messageText: string;
  context: {
    services: { serviceId: string; name: string }[];
    barbers: { barberId: string; name: string }[];
    todayLocalDate: string;
  };
}

export interface AiProvider {
  interpretMessage(input: AiInterpretInput): Promise<AiInterpretation>;
}
