import { ApiTestClient } from "./ApiTestClient";

/**
 * Development-only page to exercise /api/public/* directly — services,
 * barbers, availability, create, cancel, reschedule. Not the final
 * website (see ARCHITECTURE.md's 2026-07-20 correction) — deliberately
 * minimal, unstyled, functional only. Disabled outside development.
 */
export default function ApiTestPage() {
  if (process.env.NODE_ENV === "production") {
    return <p style={{ padding: 24, fontFamily: "monospace" }}>Not available in production.</p>;
  }
  return <ApiTestClient />;
}
