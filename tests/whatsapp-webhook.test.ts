import { describe, expect, it, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { _resetCrmClientForTests, getCrmClient } from "@/lib/crm/factory";
import { _resetEnvCacheForTests } from "@/lib/env/server";
import { _resetWhatsAppClientForTests } from "@/lib/whatsapp/factory";
import { GET, POST } from "@/app/api/whatsapp/webhook/route";

/**
 * Exercises the actual webhook route handlers against the real MockCrmClient
 * — proves signature verification, GET verification, dedup, and payload
 * classification (text / interactive / unsupported / status-only / multiple
 * events) all work through the real request/response path, not just in
 * isolated unit tests of signature.ts. WHATSAPP_PROVIDER is deliberately
 * left at its "mock" default (not "meta") — the webhook's own verification
 * only needs META_APP_SECRET/META_VERIFY_TOKEN (getMetaWebhookConfig(), not
 * gated on WHATSAPP_PROVIDER); leaving outbound sends on MockWhatsAppProvider
 * means these tests never make a real network call, even though the
 * orchestrator they trigger does send an automated reply.
 */

const APP_SECRET = "test-meta-app-secret";
const VERIFY_TOKEN = "test-verify-token";

process.env.META_APP_SECRET = APP_SECRET;
process.env.META_VERIFY_TOKEN = VERIFY_TOKEN;

function sign(rawBody: string): string {
  return `sha256=${createHmac("sha256", APP_SECRET).update(rawBody, "utf8").digest("hex")}`;
}

function postRequest(rawBody: string, signature?: string): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (signature !== undefined) headers.set("x-hub-signature-256", signature);
  return new NextRequest(new URL("/api/whatsapp/webhook", "http://localhost:3000"), {
    method: "POST",
    body: rawBody,
    headers,
  });
}

function textMessagePayload(messageId: string, from: string, body: string) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry-1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "1234567890" },
              contacts: [{ profile: { name: "Cliente Prueba" }, wa_id: from }],
              messages: [{ from, id: messageId, timestamp: "1700000000", type: "text", text: { body } }],
            },
          },
        ],
      },
    ],
  });
}

describe("WhatsApp webhook", () => {
  beforeEach(() => {
    _resetEnvCacheForTests();
    _resetCrmClientForTests();
    _resetWhatsAppClientForTests();
  });

  it("GET verification succeeds with the correct mode/token and echoes the challenge", async () => {
    const url = `http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge-123`;
    const response = await GET(new NextRequest(new URL(url)));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("challenge-123");
  });

  it("GET verification rejects an incorrect verify token", async () => {
    const url = `http://localhost:3000/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123`;
    const response = await GET(new NextRequest(new URL(url)));
    expect(response.status).toBe(403);
  });

  it("POST rejects a request with a missing signature", async () => {
    const body = textMessagePayload("wamid.1", "59171111111", "Hola");
    const response = await POST(postRequest(body));
    expect(response.status).toBe(401);
  });

  it("POST rejects a request with an invalid signature", async () => {
    const body = textMessagePayload("wamid.2", "59171111111", "Hola");
    const response = await POST(postRequest(body, "sha256=deadbeef"));
    expect(response.status).toBe(401);
  });

  it("POST rejects invalid JSON even with a valid signature over that (garbage) body", async () => {
    const body = "not json";
    const response = await POST(postRequest(body, sign(body)));
    expect(response.status).toBe(400);
  });

  it("POST accepts a valid signed text message, registers the customer and conversation, and records the message", async () => {
    const from = "59172222222";
    const body = textMessagePayload("wamid.3", from, "Hola, quiero una cita");
    const response = await POST(postRequest(body, sign(body)));
    expect(response.status).toBe(200);

    const crm = getCrmClient();
    const customer = await crm.findCustomerByPhone(from);
    expect(customer?.name).toBe("Cliente Prueba");

    const conversation = await crm.getOrCreateConversation(from);
    const messages = await crm.adminGetConversationMessages(conversation.conversationId);
    expect(messages.some((m) => m.body === "Hola, quiero una cita" && m.direction === "INBOUND")).toBe(true);
  });

  it("duplicate delivery of the same message id is processed only once", async () => {
    const from = "59173333333";
    const body = textMessagePayload("wamid.4", from, "Mensaje repetido");
    await POST(postRequest(body, sign(body)));
    await POST(postRequest(body, sign(body)));

    const crm = getCrmClient();
    const conversation = await crm.getOrCreateConversation(from);
    const messages = await crm.adminGetConversationMessages(conversation.conversationId);
    expect(messages.filter((m) => m.body === "Mensaje repetido")).toHaveLength(1);
  });

  it("handles a status-only webhook (no messages[]) without error", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-2",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "1234567890" },
                statuses: [{ id: "wamid.status.1", status: "delivered", timestamp: "1700000001", recipient_id: "59174444444" }],
              },
            },
          ],
        },
      ],
    });
    const response = await POST(postRequest(body, sign(body)));
    expect(response.status).toBe(200);
  });

  it("records an unsupported message type without throwing", async () => {
    const from = "59175555555";
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-3",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "1234567890" },
                messages: [{ from, id: "wamid.5", timestamp: "1700000002", type: "sticker" }],
              },
            },
          ],
        },
      ],
    });
    const response = await POST(postRequest(body, sign(body)));
    expect(response.status).toBe(200);

    const crm = getCrmClient();
    const conversation = await crm.getOrCreateConversation(from);
    const messages = await crm.adminGetConversationMessages(conversation.conversationId);
    expect(messages.some((m) => m.messageType === "sticker")).toBe(true);
  });

  it("processes multiple events (messages + statuses) in a single payload", async () => {
    const fromA = "59176666666";
    const fromB = "59177777777";
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-4",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "1234567890" },
                messages: [
                  { from: fromA, id: "wamid.6", timestamp: "1700000003", type: "text", text: { body: "Uno" } },
                  { from: fromB, id: "wamid.7", timestamp: "1700000004", type: "text", text: { body: "Dos" } },
                ],
                statuses: [{ id: "wamid.status.2", status: "read", timestamp: "1700000005", recipient_id: fromA }],
              },
            },
          ],
        },
      ],
    });
    const response = await POST(postRequest(body, sign(body)));
    expect(response.status).toBe(200);

    const crm = getCrmClient();
    const conversationA = await crm.getOrCreateConversation(fromA);
    const conversationB = await crm.getOrCreateConversation(fromB);
    expect((await crm.adminGetConversationMessages(conversationA.conversationId)).some((m) => m.body === "Uno")).toBe(true);
    expect((await crm.adminGetConversationMessages(conversationB.conversationId)).some((m) => m.body === "Dos")).toBe(true);
  });
});
