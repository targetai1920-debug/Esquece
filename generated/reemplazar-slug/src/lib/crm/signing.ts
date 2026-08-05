import { createHmac, randomUUID } from "node:crypto";

/**
 * Request-signing utilities for when the CRM is reached over the network
 * (e.g. a spreadsheet+script backend or any other separate-runtime CRM
 * service) — not used by LocalCrmClient, which is in-process. Kept here so
 * a project generated from this template can add a networked CRM backend
 * without re-deriving this from scratch, and so the Unicode-safety lesson
 * (see .claude/skills/barbershop-crm-builder/references/security-and-idempotency.md)
 * is available from day one.
 *
 * IMPORTANT for any second implementation of this same algorithm on another
 * runtime (e.g. a scripting-platform backend): that implementation's HMAC
 * call MUST pass an explicit UTF-8 charset. A same-runtime sign-then-verify
 * test (like the ones in tests/signing.test.ts) cannot catch a charset
 * mismatch between two different runtimes — only a real cross-runtime call,
 * or a byte-for-byte comparison against these exact test vectors, can.
 */

export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;

  if (t === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number in payload.");
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (t === "undefined" || t === "function") throw new Error(`Unsupported value type: ${t}`);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + stableStringify(obj[key])).join(",") + "}";
  }
  throw new Error(`Unsupported value type: ${t}`);
}

export interface SignableEnvelopeFields {
  version: string;
  timestamp: number;
  nonce: string;
  requestId: string;
  action: string;
  payload: unknown;
}

export function buildCanonicalString(envelope: SignableEnvelopeFields): string {
  return [
    envelope.version,
    String(envelope.timestamp),
    envelope.nonce,
    envelope.requestId,
    envelope.action,
    stableStringify(envelope.payload ?? null),
  ].join("\n");
}

export function computeHmacHex(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

export interface SignedRequestEnvelope extends SignableEnvelopeFields {
  apiKey: string;
  signature: string;
}

export const SIGNING_ENVELOPE_VERSION = "1";

/**
 * Builds a fresh signed envelope. Call this once per *physical* network
 * attempt — including retries — never reuse an envelope across a retry
 * (replay protection on the receiving side must reject a reused nonce by
 * design). The business payload and any idempotency key inside it should
 * stay identical across retries of the same logical operation; only the
 * transport envelope (nonce/timestamp/requestId/signature) is new each time.
 */
export function buildSignedRequest(action: string, payload: unknown, apiKey: string, signingSecret: string): SignedRequestEnvelope {
  const base: SignableEnvelopeFields = {
    version: SIGNING_ENVELOPE_VERSION,
    timestamp: Date.now(),
    nonce: randomUUID(),
    requestId: randomUUID(),
    action,
    payload: payload ?? null,
  };
  const signature = computeHmacHex(buildCanonicalString(base), signingSecret);
  return { ...base, apiKey, signature };
}
