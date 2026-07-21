import { z } from "zod";

/**
 * Loose-but-typed Zod schemas for the Meta WhatsApp Cloud API webhook body.
 * Permissive (passthrough) on fields this codebase doesn't read — Meta's
 * payload has many optional/rarely-used fields — but strict about the
 * shape of what's actually used. See WHATSAPP_AGENT_DESIGN.md §1.
 */

/**
 * One permissive schema rather than a discriminated union — Meta's `type`
 * field covers many more values than we specifically handle (image, audio,
 * location, sticker, contacts, unknown/unsupported, …), and `text`/
 * `interactive` are simply absent for those, not a type error. Callers
 * switch on `type` and read the optional fields that apply.
 */
export const inboundMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  interactive: z.object({
    type: z.enum(["button_reply", "list_reply"]).optional(),
    button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    list_reply: z.object({ id: z.string(), title: z.string(), description: z.string().optional() }).optional(),
  }).optional(),
}).passthrough();
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const messageStatusSchema = z.object({
  id: z.string(),
  status: z.enum(["sent", "delivered", "read", "failed"]),
  timestamp: z.string(),
  recipient_id: z.string(),
}).passthrough();
export type MessageStatus = z.infer<typeof messageStatusSchema>;

const changeValueSchema = z.object({
  messaging_product: z.literal("whatsapp").optional(),
  metadata: z.object({ display_phone_number: z.string().optional(), phone_number_id: z.string().optional() }).optional(),
  contacts: z.array(z.object({ profile: z.object({ name: z.string().optional() }).optional(), wa_id: z.string() })).optional(),
  messages: z.array(inboundMessageSchema).optional(),
  statuses: z.array(messageStatusSchema).optional(),
}).passthrough();
export type ChangeValue = z.infer<typeof changeValueSchema>;

const changeSchema = z.object({
  value: changeValueSchema,
  field: z.string(),
});

const entrySchema = z.object({
  id: z.string(),
  changes: z.array(changeSchema),
});

export const webhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(entrySchema),
});
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

/** Best-effort contact display name for the inbound sender, if Meta included one. */
export function findContactName(value: ChangeValue, waId: string): string | undefined {
  return value.contacts?.find((c) => c.wa_id === waId)?.profile?.name;
}

export function messageTextBody(message: InboundMessage): string | undefined {
  if (message.text) return message.text.body;
  if (message.interactive) return message.interactive.button_reply?.title || message.interactive.list_reply?.title;
  return undefined;
}

export function interactiveReplyId(message: InboundMessage): string | undefined {
  return message.interactive?.button_reply?.id || message.interactive?.list_reply?.id;
}
