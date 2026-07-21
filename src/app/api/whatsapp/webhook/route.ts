import { NextResponse, type NextRequest } from "next/server";
import { getMetaConfig } from "@/lib/env/server";
import { getCrmClient } from "@/lib/crm/factory";
import { logger } from "@/lib/logging/logger";
import { normalizeWaId } from "@/lib/whatsapp/phone";
import { verifyMetaSignature, verifyTokenMatches } from "@/lib/whatsapp/signature";
import { findContactName, interactiveReplyId, messageTextBody, webhookPayloadSchema, type ChangeValue, type InboundMessage, type MessageStatus } from "@/lib/whatsapp/webhookSchemas";
import type { CrmClient } from "@/lib/crm/types";

/**
 * Meta WhatsApp Cloud API webhook — WHATSAPP_AGENT_DESIGN.md §1. Direct
 * Next.js route (never Apps Script — master spec §12). This route's scope
 * is infrastructure only (Phase H): verify, parse, deduplicate, normalize
 * the sender, load/create the customer and conversation, and persist the
 * inbound message. Composing and sending an automated reply is Phase I
 * (the Claude agent) — building on top of the conversation this route
 * already guarantees exists and has recorded every message into.
 */

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const config = getMetaConfig();
  if (mode === "subscribe" && verifyTokenMatches(token, config.verifyToken) && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const config = getMetaConfig();

  // Raw body first — the signature is computed over these exact bytes, not
  // a re-serialized parse of them (WHATSAPP_AGENT_DESIGN.md §1).
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature, config.appSecret)) {
    logger.warn("Rejected WhatsApp webhook with invalid or missing signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const parsed = webhookPayloadSchema.safeParse(rawJson);
  if (!parsed.success) {
    logger.warn("Rejected WhatsApp webhook with an unsupported payload structure");
    return new NextResponse("Unsupported payload structure", { status: 400 });
  }

  const crm = getCrmClient();

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const value = change.value;

      for (const message of value.messages || []) {
        try {
          await handleInboundMessage(crm, value, message);
        } catch (err) {
          logger.error("Failed to process inbound WhatsApp message", {
            error: err instanceof Error ? err.message : String(err),
          });
          await crm.markWebhookEventFailed(message.id, "PROCESSING_ERROR").catch(() => undefined);
        }
      }

      for (const status of value.statuses || []) {
        try {
          await handleMessageStatus(crm, status);
        } catch (err) {
          logger.error("Failed to process WhatsApp status event", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  // Meta retries aggressively on non-200 — always ack once the payload is
  // structurally accepted, even if a specific event's processing failed
  // (WHATSAPP_AGENT_DESIGN.md §1 point 4); dedup (registerWebhookEvent)
  // is what protects against Meta's own retries causing duplicate effects.
  return NextResponse.json({ ok: true });
}

async function handleInboundMessage(crm: CrmClient, value: ChangeValue, message: InboundMessage) {
  const dedup = await crm.registerWebhookEvent({
    externalEventId: message.id,
    eventType: "message",
    phoneE164: normalizeWaId(message.from) || undefined,
  });
  if (dedup.isDuplicate) {
    logger.info("Skipped duplicate WhatsApp message event", { externalEventId: message.id });
    return;
  }

  const phoneE164 = normalizeWaId(message.from);
  if (!phoneE164) {
    await crm.markWebhookEventFailed(message.id, "INVALID_PHONE");
    return;
  }

  const contactName = findContactName(value, message.from);
  const customer = await crm.upsertCustomer({ phoneE164, name: contactName, source: "WHATSAPP" });
  const conversation = await crm.getOrCreateConversation(phoneE164);

  await crm.appendConversationMessage(conversation.conversationId, {
    direction: "INBOUND",
    messageType: message.type,
    body: messageTextBody(message) || interactiveReplyId(message) || `[${message.type}]`,
    externalMessageId: message.id,
  });

  void customer; // upserted for its side effect (creates/updates the CUSTOMERS row); not otherwise needed in this phase.

  await crm.markWebhookEventProcessed(message.id);
}

async function handleMessageStatus(crm: CrmClient, status: MessageStatus) {
  const dedup = await crm.registerWebhookEvent({
    externalEventId: `status:${status.id}:${status.status}`,
    eventType: "status",
    phoneE164: normalizeWaId(status.recipient_id) || undefined,
  });
  if (dedup.isDuplicate) return;

  // Delivery-status → NOTIFICATIONS/CONVERSATION_MESSAGES correlation is
  // Phase J's concern (it needs the outbound message id already recorded
  // by the sender). For now this just closes out the dedup row.
  await crm.markWebhookEventProcessed(`status:${status.id}:${status.status}`);
}
