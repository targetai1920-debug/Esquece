import { createHmac, randomUUID } from "node:crypto";

/**
 * Pure crypto/serialization utilities — no secrets live in this file (the
 * signing secret is passed in by the caller), so this is safe to import
 * from tests directly. The actual secret holder is env/server.ts
 * (guarded by "server-only") and AppsScriptCrmClient, which is the only
 * caller of buildSignedRequest in application code.
 *
 * MUST produce byte-identical output to apps-script/Security.gs. Verified
 * against the three shared test vectors in API_CONTRACT.md — see
 * signing.test.ts. Any change here needs the same change mirrored in
 * Security.gs, and both test suites re-run.
 */

export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;

  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Non-finite number in payload.");
    }
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") {
    return JSON.stringify(value);
  }
  if (t === "undefined" || t === "function") {
    throw new Error(`Unsupported value type: ${t}`);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((key) => JSON.stringify(key) + ":" + stableStringify(obj[key]));
    return "{" + parts.join(",") + "}";
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
  return createHmac("sha256", secret).update(message).digest("hex");
}

export interface SignedRequestEnvelope extends SignableEnvelopeFields {
  apiKey: string;
  signature: string;
}

export const CRM_ENVELOPE_VERSION = "1";

export function buildSignedRequest(
  action: string,
  payload: unknown,
  apiKey: string,
  signingSecret: string,
): SignedRequestEnvelope {
  const base: SignableEnvelopeFields = {
    version: CRM_ENVELOPE_VERSION,
    timestamp: Date.now(),
    nonce: randomUUID(),
    requestId: randomUUID(),
    action,
    payload: payload ?? null,
  };
  const signature = computeHmacHex(buildCanonicalString(base), signingSecret);
  return { ...base, apiKey, signature };
}
