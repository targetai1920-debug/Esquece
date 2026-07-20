import { describe, expect, it } from "vitest";
import { buildCanonicalString, computeHmacHex, stableStringify } from "@/lib/crm/signing";

/**
 * Verifies this Next.js-side implementation against the exact shared test
 * vectors documented in API_CONTRACT.md, which were themselves verified
 * against apps-script/Security.gs's actual logic (see that phase's
 * verification notes in IMPLEMENTATION_STATUS.md). If any of these three
 * fail, the two implementations have diverged — fix here, not there,
 * unless the divergence is intentional and both files + API_CONTRACT.md
 * are updated together.
 */
const SIGNING_SECRET = "test-signing-secret";

describe("CRM request signing — shared vectors with apps-script/Security.gs", () => {
  it("Vector 1: sorts object keys", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');

    const canonical = buildCanonicalString({
      version: "1",
      timestamp: 1700000000000,
      nonce: "test-nonce",
      requestId: "test-request-id",
      action: "health",
      payload: { b: 1, a: 2 },
    });
    expect(canonical).toBe("1\n1700000000000\ntest-nonce\ntest-request-id\nhealth\n{\"a\":2,\"b\":1}");
    expect(computeHmacHex(canonical, SIGNING_SECRET)).toBe(
      "d7eaa26d18d5db099c793f4674cdb116d7ad09a88fd8c8a8ed33a0f594b7bdf0",
    );
  });

  it("Vector 2: nested object, null, array, boolean", () => {
    const canonical = buildCanonicalString({
      version: "1",
      timestamp: 1700000000000,
      nonce: "test-nonce-2",
      requestId: "test-request-id-2",
      action: "createAppointment",
      payload: {
        serviceId: "svc_1",
        barberId: null,
        anyBarber: true,
        localDate: "2026-07-21",
        localStartTime: "10:00",
        tags: ["a", "b"],
      },
    });
    expect(computeHmacHex(canonical, SIGNING_SECRET)).toBe(
      "5a29b9f0e91b339ba5f2cb20c8b2b307acd1647a6cf6fdd078f40b83065f252b",
    );
  });

  it("Vector 3: empty payload", () => {
    const canonical = buildCanonicalString({
      version: "1",
      timestamp: 1700000000000,
      nonce: "test-nonce-3",
      requestId: "test-request-id-3",
      action: "health",
      payload: {},
    });
    expect(computeHmacHex(canonical, SIGNING_SECRET)).toBe(
      "19a7d590f15cf4c81e7be74fb7d042262d143296eb139fd7f353db11e194879d",
    );
  });

  it("rejects non-finite numbers", () => {
    expect(() => stableStringify({ a: NaN })).toThrow();
    expect(() => stableStringify({ a: Infinity })).toThrow();
  });

  it("rejects undefined values instead of silently dropping them", () => {
    expect(() => stableStringify({ a: undefined })).toThrow();
  });

  it("preserves array order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });
});
