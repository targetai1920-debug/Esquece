import { randomUUID } from "node:crypto";
import type { WhatsAppButton, WhatsAppListSection, WhatsAppProvider, WhatsAppSendResult } from "./types";

export interface RecordedMessage {
  to: string;
  kind: "text" | "interactive_buttons" | "interactive_list" | "template";
  body: string;
  messageId: string;
  sentAt: string;
}

/**
 * In-memory WhatsApp provider for local dev, automated tests, and
 * `/dev/whatsapp-simulator` (Phase H/I). Records every send so the
 * simulator UI and tests can assert on what the agent actually sent,
 * without any real Meta credentials or network calls.
 */
export class MockWhatsAppProvider implements WhatsAppProvider {
  sentMessages: RecordedMessage[] = [];
  /** Test hook — set to make the next send() call throw, simulating a Meta outage. */
  failNextSend = false;

  private record(to: string, kind: RecordedMessage["kind"], body: string): WhatsAppSendResult {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error("Simulated WhatsApp send failure");
    }
    const messageId = `mock-wamid-${randomUUID()}`;
    this.sentMessages.push({ to, kind, body, messageId, sentAt: new Date().toISOString() });
    return { messageId };
  }

  async sendText(to: string, body: string): Promise<WhatsAppSendResult> {
    return this.record(to, "text", body);
  }

  async sendInteractiveButtons(to: string, bodyText: string, buttons: WhatsAppButton[]): Promise<WhatsAppSendResult> {
    return this.record(to, "interactive_buttons", `${bodyText} [${buttons.map((b) => b.title).join(" | ")}]`);
  }

  async sendInteractiveList(to: string, bodyText: string, buttonText: string, sections: WhatsAppListSection[]): Promise<WhatsAppSendResult> {
    const options = sections.flatMap((s) => s.rows.map((r) => r.title)).join(" | ");
    return this.record(to, "interactive_list", `${bodyText} (${buttonText}) [${options}]`);
  }

  async sendTemplate(to: string, templateName: string, languageCode: string, bodyParams?: string[]): Promise<WhatsAppSendResult> {
    return this.record(to, "template", `[${templateName}/${languageCode}] ${(bodyParams || []).join(", ")}`);
  }

  async markAsRead(): Promise<void> {
    // No-op — nothing to assert on for a read receipt in the mock.
  }

  /** Test/simulator-only: clears recorded sends. */
  reset() {
    this.sentMessages = [];
    this.failNextSend = false;
  }
}
