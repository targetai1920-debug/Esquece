import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getAnthropicConfig } from "@/lib/env/server";
import { logger } from "@/lib/logging/logger";
import type { AiInterpretation, AiInterpretInput, AiProvider } from "./types";

/**
 * Real Claude integration. Structured output via tool-use (not free-form
 * text parsing) — Claude is forced to call the single `interpret_message`
 * tool, and its `input` is validated against `interpretationSchema` before
 * this codebase trusts a single field of it. System prompt explicitly
 * enumerates the real services/barbers/today's date so Claude interprets
 * against real data instead of inventing any of it (master spec §14 "Claude
 * may not: invent services/prices/barbers/schedules/availability").
 */

const interpretationSchema = z.object({
  intent: z.enum([
    "GREETING", "BOOK_APPOINTMENT", "SELECT_SERVICE", "SELECT_BARBER", "SELECT_DATE", "SELECT_TIME",
    "PROVIDE_NAME", "CONFIRM", "DENY", "CANCEL_APPOINTMENT", "RESCHEDULE_APPOINTMENT", "REQUEST_HUMAN",
    "COMPLAINT", "FAQ_QUESTION", "START_OVER", "UNKNOWN",
  ]),
  serviceName: z.string().optional(),
  barberName: z.string().optional(),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  customerName: z.string().optional(),
  confidence: z.number().min(0).max(1),
  needsHumanHandoff: z.boolean(),
  handoffReason: z.string().optional(),
  replyDraft: z.string(),
});

const TOOL_NAME = "interpret_message";

const toolInputSchema = {
  type: "object" as const,
  properties: {
    intent: { type: "string", enum: [
      "GREETING", "BOOK_APPOINTMENT", "SELECT_SERVICE", "SELECT_BARBER", "SELECT_DATE", "SELECT_TIME",
      "PROVIDE_NAME", "CONFIRM", "DENY", "CANCEL_APPOINTMENT", "RESCHEDULE_APPOINTMENT", "REQUEST_HUMAN",
      "COMPLAINT", "FAQ_QUESTION", "START_OVER", "UNKNOWN",
    ] },
    serviceName: { type: "string", description: "Exact name of a service from the provided list, only if the customer clearly referred to one." },
    barberName: { type: "string", description: "Exact name of a barber from the provided list, only if the customer clearly referred to one." },
    localDate: { type: "string", description: "YYYY-MM-DD, resolved from natural language using todayLocalDate as the reference point." },
    localTime: { type: "string", description: "HH:mm 24-hour format." },
    customerName: { type: "string" },
    confidence: { type: "number", description: "0 to 1 — how confident you are in this interpretation." },
    needsHumanHandoff: { type: "boolean" },
    handoffReason: { type: "string" },
    replyDraft: { type: "string", description: "A short, friendly Spanish reply draft. Never mention a price, service, barber, or availability that was not given to you." },
  },
  required: ["intent", "confidence", "needsHumanHandoff", "replyDraft"],
};

function buildSystemPrompt(input: AiInterpretInput): string {
  return [
    "Eres el asistente de reservas de Esquece Barber Studio por WhatsApp.",
    "Tu única función es interpretar el mensaje del cliente y llamar a la herramienta interpret_message con tu interpretación estructurada.",
    "NUNCA inventes servicios, barberos, precios, horarios ni disponibilidad — solo puedes referirte a los que se listan abajo.",
    "NUNCA confirmes una cita, cancelación o reprogramación tú mismo — solo interpreta la intención; el sistema decide y ejecuta.",
    `Estado actual de la conversación: ${input.conversationState}.`,
    `Datos ya recopilados en esta conversación: ${JSON.stringify(input.scratchData)}.`,
    `Fecha de hoy: ${input.context.todayLocalDate}.`,
    `Servicios reales disponibles: ${input.context.services.map((s) => s.name).join(", ") || "(ninguno)"}.`,
    `Barberos reales disponibles: ${input.context.barbers.map((b) => b.name).join(", ") || "(ninguno)"}.`,
  ].join("\n");
}

export class AnthropicAiProvider implements AiProvider {
  private client(): Anthropic {
    const config = getAnthropicConfig();
    return new Anthropic({ apiKey: config.apiKey });
  }

  async interpretMessage(input: AiInterpretInput): Promise<AiInterpretation> {
    const config = getAnthropicConfig();
    const client = this.client();

    const response = await client.messages.create({
      model: config.model,
      max_tokens: 1024,
      system: buildSystemPrompt(input),
      messages: [{ role: "user", content: input.messageText }],
      tools: [{ name: TOOL_NAME, description: "Records the structured interpretation of the customer's message.", input_schema: toolInputSchema }],
      tool_choice: { type: "tool", name: TOOL_NAME },
    });

    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (!toolUse) {
      logger.error("Anthropic response contained no tool_use block");
      throw new Error("AI_INVALID_RESPONSE");
    }

    const parsed = interpretationSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      logger.error("Anthropic tool_use input failed schema validation", { issues: parsed.error.issues.map((i) => i.path.join(".")) });
      throw new Error("AI_INVALID_RESPONSE");
    }

    return parsed.data;
  }
}
