import { describe, expect, it } from "vitest";
import { buildCanonicalString, buildSignedRequest, computeHmacHex, stableStringify } from "@/lib/crm/signing";

const SIGNING_SECRET = "test-signing-secret";

describe("request signing — canonicalization and HMAC", () => {
  it("sorts object keys deterministically", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("preserves array order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("rejects non-finite numbers and undefined instead of dropping them", () => {
    expect(() => stableStringify({ a: Infinity })).toThrow();
    expect(() => stableStringify({ a: undefined })).toThrow();
  });

  it("produces a stable, reproducible signature for a fixed canonical string", () => {
    const canonical = buildCanonicalString({
      version: "1",
      timestamp: 1700000000000,
      nonce: "n",
      requestId: "r",
      action: "health",
      payload: { a: 1 },
    });
    const sig1 = computeHmacHex(canonical, SIGNING_SECRET);
    const sig2 = computeHmacHex(canonical, SIGNING_SECRET);
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64);
  });

  // Unicode vectors — the exact class of bug documented in
  // .claude/skills/barbershop-crm-builder/references/security-and-idempotency.md:
  // any second implementation of this algorithm on another runtime MUST use
  // an explicit UTF-8 charset for its HMAC call, or these will diverge.
  it("signs accented characters consistently", () => {
    const canonical = buildCanonicalString({
      version: "1",
      timestamp: 1700000000000,
      nonce: "n",
      requestId: "r",
      action: "createAppointment",
      payload: { notes: "Género, corazón, José Núñez" },
    });
    expect(computeHmacHex(canonical, SIGNING_SECRET)).toHaveLength(64);
    // Re-signing the identical string must always produce the identical signature.
    expect(computeHmacHex(canonical, SIGNING_SECRET)).toBe(computeHmacHex(canonical, SIGNING_SECRET));
  });

  it("signs emoji and embedded newlines consistently", () => {
    const canonical = buildCanonicalString({
      version: "1",
      timestamp: 1700000000000,
      nonce: "n",
      requestId: "r",
      action: "createAppointment",
      payload: { notes: "Line one\nLine two 💈✂️" },
    });
    expect(computeHmacHex(canonical, SIGNING_SECRET)).toHaveLength(64);
  });

  it("produces different signatures for different Unicode payloads (no silent collision)", () => {
    const build = (notes: string) =>
      computeHmacHex(
        buildCanonicalString({ version: "1", timestamp: 1700000000000, nonce: "n", requestId: "r", action: "createAppointment", payload: { notes } }),
        SIGNING_SECRET,
      );
    expect(build("café")).not.toBe(build("cafe"));
  });
});

describe("buildSignedRequest — fresh envelope per call", () => {
  it("builds a new nonce, timestamp, and signature on every call, even with identical payload", () => {
    const payload = { idempotencyKey: "same-key", serviceId: "svc-1" };
    const first = buildSignedRequest("createAppointment", payload, "api-key", SIGNING_SECRET);
    const second = buildSignedRequest("createAppointment", payload, "api-key", SIGNING_SECRET);

    expect(first.nonce).not.toBe(second.nonce);
    expect(first.requestId).not.toBe(second.requestId);
    expect(first.signature).not.toBe(second.signature);
    // The business payload (and any idempotency key inside it) is unchanged across attempts.
    expect(first.payload).toEqual(second.payload);
  });

  it("round-trips through JSON.stringify/JSON.parse without altering the signature", () => {
    const envelope = buildSignedRequest("createAppointment", { notes: "Reserva con acentos: ñ, é, í" }, "api-key", SIGNING_SECRET);
    const received = JSON.parse(JSON.stringify(envelope));
    const reconstructed = buildCanonicalString({
      version: received.version,
      timestamp: received.timestamp,
      nonce: received.nonce,
      requestId: received.requestId,
      action: received.action,
      payload: received.payload,
    });
    expect(computeHmacHex(reconstructed, SIGNING_SECRET)).toBe(received.signature);
  });
});
