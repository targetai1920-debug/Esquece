"use client";

import { useCallback, useEffect, useState } from "react";
import type { Conversation, ConversationMessage } from "@/lib/crm/types";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!json.ok) throw new Error(json.error?.message || "Error desconocido");
  return json.data;
}

export function WhatsAppSimulatorClient() {
  const [phoneE164, setPhoneE164] = useState("59171234567");
  const [messageText, setMessageText] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const response = await fetch(`/api/dev/whatsapp-simulator/state?phoneE164=${encodeURIComponent(phoneE164)}`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      setConversation(json.data.conversation);
      setMessages(json.data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la conversación");
    }
  }, [phoneE164]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional load-on-phone-change for this dev debug tool
    void loadState();
  }, [loadState]);

  async function send() {
    if (!messageText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const data = await postJson("/api/dev/whatsapp-simulator/send", { phoneE164, messageText });
      setConversation(data.conversation);
      setMessages(data.messages);
      setMessageText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar el mensaje");
    } finally {
      setSending(false);
    }
  }

  async function reset() {
    setError(null);
    try {
      await postJson("/api/dev/whatsapp-simulator/reset", { phoneE164 });
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reiniciar la conversación");
    }
  }

  async function armFault(target: "crm" | "ai" | "whatsapp") {
    setError(null);
    try {
      await postJson("/api/dev/whatsapp-simulator/fault", { target });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al simular la falla");
    }
  }

  let scratch: Record<string, unknown> = {};
  try {
    scratch = conversation?.scratchDataJson ? JSON.parse(conversation.scratchDataJson) : {};
  } catch {
    scratch = {};
  }

  return (
    <div style={{ padding: 24, fontFamily: "monospace", display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, maxWidth: 1100 }}>
      <div>
        <h1>WhatsApp Simulator (dev only)</h1>
        <p style={{ color: "#666", fontSize: 13 }}>
          Runs the real conversation orchestrator against the same in-process MockCrmClient/MockAiProvider/MockWhatsAppProvider — not a separate fake calendar.
        </p>

        <div style={{ marginBottom: 12 }}>
          <label>Teléfono simulado: </label>
          <input value={phoneE164} onChange={(e) => setPhoneE164(e.target.value)} style={{ fontFamily: "monospace" }} />
        </div>

        {error && <p style={{ color: "red" }}>{error}</p>}

        <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 12, minHeight: 300, marginBottom: 12 }}>
          {messages.map((m) => (
            <div key={m.messageId} style={{ textAlign: m.direction === "INBOUND" ? "left" : "right", margin: "4px 0" }}>
              <span style={{ background: m.direction === "INBOUND" ? "#e5e5e5" : "#d6ff3f", padding: "4px 8px", borderRadius: 6, display: "inline-block", maxWidth: "80%" }}>
                {m.body}
              </span>
            </div>
          ))}
          {messages.length === 0 && <p style={{ color: "#999" }}>Sin mensajes todavía.</p>}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={{ flex: 1, fontFamily: "monospace" }}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Escribe como si fueras el cliente…"
          />
          <button onClick={send} disabled={sending}>Enviar</button>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 16 }}>Estado</h2>
        <p>Estado: <b>{conversation?.state}</b></p>
        <p>Handoff activo: <b>{String(conversation?.humanHandoffActive)}</b></p>
        <p>Versión: {conversation?.version}</p>
        <pre style={{ background: "#f4f4f4", padding: 8, borderRadius: 6, fontSize: 12, overflowX: "auto" }}>{JSON.stringify(scratch, null, 2)}</pre>

        <h2 style={{ fontSize: 16, marginTop: 16 }}>Controles</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={reset}>Reiniciar conversación</button>
          <button onClick={() => armFault("crm")}>Simular falla del CRM (próxima llamada)</button>
          <button onClick={() => armFault("ai")}>Simular falla de la IA (próxima llamada)</button>
          <button onClick={() => armFault("whatsapp")}>Simular falla de envío WhatsApp (próximo envío)</button>
        </div>
      </div>
    </div>
  );
}
