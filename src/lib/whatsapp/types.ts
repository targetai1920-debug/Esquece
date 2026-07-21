/**
 * WhatsApp send-side abstraction — every outbound message (agent replies,
 * notifications/reminders in Phase J) goes through this interface, never a
 * direct Graph API call scattered across call sites. Mirrors the CrmClient
 * pattern (ARCHITECTURE.md §2): one mock implementation for demo/dev/tests,
 * one real implementation that alone knows Meta credentials.
 */

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface WhatsAppListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppListSection {
  title?: string;
  rows: WhatsAppListRow[];
}

export interface WhatsAppSendResult {
  messageId: string;
}

export interface WhatsAppProvider {
  sendText(to: string, body: string): Promise<WhatsAppSendResult>;
  sendInteractiveButtons(to: string, bodyText: string, buttons: WhatsAppButton[]): Promise<WhatsAppSendResult>;
  sendInteractiveList(to: string, bodyText: string, buttonText: string, sections: WhatsAppListSection[]): Promise<WhatsAppSendResult>;
  sendTemplate(to: string, templateName: string, languageCode: string, bodyParams?: string[]): Promise<WhatsAppSendResult>;
  markAsRead(externalMessageId: string): Promise<void>;
}
