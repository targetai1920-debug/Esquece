/**
 * The single, shared phone-normalization function. Every module that needs
 * a phone number (webhook handler, Customer lookup, Conversation lookup,
 * outbound sending) must import this — no second implementation anywhere.
 * See WHATSAPP_AGENT_DESIGN.md #2.
 */
export function normalizeWaId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[+\s]/g, "").trim();
  return normalized.length > 0 ? normalized : null;
}
