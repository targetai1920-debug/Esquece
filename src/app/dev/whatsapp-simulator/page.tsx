import { WhatsAppSimulatorClient } from "./WhatsAppSimulatorClient";

/**
 * Development-only tool to exercise the full conversation orchestrator
 * (WhatsApp booking/cancel/reschedule flows, human handoff) without any
 * real Meta/Anthropic credentials — master spec §20. Not the final website,
 * not a production feature. Disabled outside development.
 */
export default function WhatsAppSimulatorPage() {
  if (process.env.NODE_ENV === "production") {
    return <p style={{ padding: 24, fontFamily: "monospace" }}>Not available in production.</p>;
  }
  return <WhatsAppSimulatorClient />;
}
