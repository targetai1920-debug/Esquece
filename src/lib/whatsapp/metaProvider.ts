import "server-only";
import { getMetaConfig } from "@/lib/env/server";
import { logger } from "@/lib/logging/logger";
import type { WhatsAppButton, WhatsAppListSection, WhatsAppProvider, WhatsAppSendResult } from "./types";

/**
 * Real Meta WhatsApp Cloud API client — the only module that holds
 * WHATSAPP_ACCESS_TOKEN and talks to graph.facebook.com. See
 * WHATSAPP_AGENT_DESIGN.md §9 for the 24-hour-window / template-error
 * handling this maps Meta's error codes onto.
 */

interface MetaSendError extends Error {
  metaErrorCode?: number;
  /** True for Meta error 131047 — outside the 24h customer-initiated window, requires a template. */
  requiresTemplate?: boolean;
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  private async post(body: Record<string, unknown>): Promise<WhatsAppSendResult> {
    const config = getMetaConfig();
    const url = `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      const metaError = json?.error;
      const err: MetaSendError = new Error(metaError?.message || `WhatsApp send failed with status ${response.status}`);
      err.metaErrorCode = metaError?.code;
      err.requiresTemplate = metaError?.code === 131047;
      logger.error("Meta WhatsApp send failed", { metaErrorCode: metaError?.code, metaErrorTitle: metaError?.error_subcode });
      throw err;
    }

    const messageId = json?.messages?.[0]?.id;
    if (!messageId) {
      throw new Error("Meta WhatsApp response missing message id");
    }
    return { messageId };
  }

  async sendText(to: string, body: string): Promise<WhatsAppSendResult> {
    return this.post({ to, type: "text", text: { body } });
  }

  async sendInteractiveButtons(to: string, bodyText: string, buttons: WhatsAppButton[]): Promise<WhatsAppSendResult> {
    return this.post({
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: { buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
      },
    });
  }

  async sendInteractiveList(to: string, bodyText: string, buttonText: string, sections: WhatsAppListSection[]): Promise<WhatsAppSendResult> {
    return this.post({
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: {
          button: buttonText,
          sections: sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({ id: r.id, title: r.title, description: r.description })),
          })),
        },
      },
    });
  }

  async sendTemplate(to: string, templateName: string, languageCode: string, bodyParams?: string[]): Promise<WhatsAppSendResult> {
    return this.post({
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: bodyParams?.length
          ? [{ type: "body", parameters: bodyParams.map((p) => ({ type: "text", text: p })) }]
          : undefined,
      },
    });
  }

  async markAsRead(externalMessageId: string): Promise<void> {
    const config = getMetaConfig();
    const url = `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: externalMessageId }),
    }).catch((err) => {
      logger.warn("Meta WhatsApp markAsRead failed (non-fatal)", { error: err instanceof Error ? err.message : String(err) });
    });
  }
}
