"use client";

import { useState } from "react";
import type { Conversation, ConversationMessage, HumanHandoff } from "@/lib/crm/types";

export function ConversationsClient({
  initialConversations,
  initialHandoffs,
}: {
  initialConversations: Conversation[];
  initialHandoffs: HumanHandoff[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [handoffs, setHandoffs] = useState(initialHandoffs);
  const [messages, setMessages] = useState<ConversationMessage[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyHandoff, setOnlyHandoff] = useState(false);

  async function refresh() {
    const [conv, hnd] = await Promise.all([
      fetch(`/api/admin/conversations?handoffActiveOnly=${onlyHandoff}`).then((r) => r.json()),
      fetch("/api/admin/handoffs").then((r) => r.json()),
    ]);
    if (conv.ok) setConversations(conv.data);
    if (hnd.ok) setHandoffs(hnd.data);
  }

  async function viewMessages(conversationId: string) {
    setError(null);
    setSelectedId(conversationId);
    try {
      const response = await fetch(`/api/admin/conversations/${conversationId}/messages`);
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      setMessages(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar mensajes");
    }
  }

  async function resolveHandoff(handoffId: string, reactivateBot: boolean) {
    setError(null);
    try {
      const response = await fetch(`/api/admin/handoffs/${handoffId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactivateBot }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error?.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al resolver el handoff");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Conversaciones</h1>
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">Handoffs abiertos</h2>
        {handoffs.length === 0 && <p className="text-sm text-neutral-500">Sin handoffs activos.</p>}
        <ul className="space-y-1 text-sm">
          {handoffs.map((h) => (
            <li key={h.handoffId} className="flex items-center justify-between rounded border border-neutral-200 p-2 dark:border-neutral-800">
              <span>{h.phoneE164} — {h.reason}</span>
              <span className="flex gap-2">
                <button onClick={() => resolveHandoff(h.handoffId, true)} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">Resolver y reactivar bot</button>
                <button onClick={() => resolveHandoff(h.handoffId, false)} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">Resolver (bot sigue apagado)</button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Conversaciones recientes</h2>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={onlyHandoff} onChange={(e) => { setOnlyHandoff(e.target.checked); void refresh(); }} /> Solo con handoff activo
          </label>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left dark:bg-neutral-900">
                <tr><th className="p-2">Teléfono</th><th className="p-2">Estado</th><th className="p-2">Handoff</th><th className="p-2"></th></tr>
              </thead>
              <tbody>
                {conversations.map((c) => (
                  <tr key={c.conversationId} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="p-2">{c.phoneE164}</td>
                    <td className="p-2">{c.state}</td>
                    <td className="p-2">{c.humanHandoffActive ? "Sí" : "No"}</td>
                    <td className="p-2">
                      <button onClick={() => viewMessages(c.conversationId)} className="rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700">Ver mensajes</button>
                    </td>
                  </tr>
                ))}
                {conversations.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-neutral-500">Sin conversaciones.</td></tr>}
              </tbody>
            </table>
          </div>

          {selectedId && messages && (
            <div className="max-h-96 space-y-2 overflow-y-auto rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              {messages.map((m) => (
                <div key={m.messageId} className={`rounded p-2 text-sm ${m.direction === "INBOUND" ? "bg-neutral-100 dark:bg-neutral-800" : "bg-neutral-50 text-right dark:bg-neutral-900"}`}>
                  <p>{m.body}</p>
                  <p className="text-xs text-neutral-500">{m.direction} · {m.messageType}</p>
                </div>
              ))}
              {messages.length === 0 && <p className="text-sm text-neutral-500">Sin mensajes registrados.</p>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
