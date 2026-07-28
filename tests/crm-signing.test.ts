import { describe, expect, it } from "vitest";
import { buildCanonicalString, buildSignedRequest, computeHmacHex, stableStringify } from "@/lib/crm/signing";

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

  // Vectors 4-7: reproduce the production INVALID_SIGNATURE bug on
  // createAppointment, where web-reservas generates customerNotes with
  // accented Spanish text (e.g. "Género indicado por el cliente: Hombre.").
  // Apps Script's Security.gs computeHmacHex_ must pass Utilities.Charset.UTF_8
  // explicitly (not rely on the 2-arg overload's implicit charset) to
  // byte-match these signatures — see apps-script/Tests.gs's mirrored
  // vectors 4-7 and SECURITY.md "CRM request signing".
  it("Vector 4: Unicode customerNotes (accented characters)", () => {
    const canonical = buildCanonicalString({
      version: "1",
      timestamp: 1700000000000,
      nonce: "test-nonce-4",
      requestId: "test-request-id-4",
      action: "createAppointment",
      payload: {
        serviceId: "svc_1",
        barberId: "barber_1",
        localDate: "2026-07-30",
        localStartTime: "11:30",
        customerNotes: "Género indicado por el cliente: Hombre.",
      },
    });
    expect(computeHmacHex(canonical, SIGNING_SECRET)).toBe(
      "f854f0816804dffe13f4a449566ba2a2edac068282cd32e18916892be44d406a",
    );
  });

  it("Vector 5: Unicode customer name (all Spanish accented letters + ñ)", () => {
    const canonical = buildCanonicalString({
      version: "1",
      timestamp: 1700000000000,
      nonce: "test-nonce-5",
      requestId: "test-request-id-5",
      action: "createAppointment",
      payload: { customer: { name: "José Núñez", phoneE164: "+59170000000" }, serviceId: "svc_1" },
    });
    expect(computeHmacHex(canonical, SIGNING_SECRET)).toBe(
      "5be1550964aab6df803a0d9004baac3cfc0e7668646d6cd09ab98569822a41fc",
    );
  });

  it("Vector 6: emoji in customerNotes", () => {
    const canonical = buildCanonicalString({
      version: "1",
      timestamp: 1700000000000,
      nonce: "test-nonce-6",
      requestId: "test-request-id-6",
      action: "createAppointment",
      payload: { serviceId: "svc_1", customerNotes: "Reserva confirmada 💈✂️" },
    });
    expect(computeHmacHex(canonical, SIGNING_SECRET)).toBe(
      "d1d6ef6f4b5c5b7dbe70bc1591b6ba82a5eabaec41fd59b9f269733c522f25f5",
    );
  });

  it("Vector 7: newline + accented characters in customerNotes", () => {
    const canonical = buildCanonicalString({
      version: "1",
      timestamp: 1700000000000,
      nonce: "test-nonce-7",
      requestId: "test-request-id-7",
      action: "createAppointment",
      payload: { serviceId: "svc_1", customerNotes: "Línea uno\nLínea dos: ñ á é í ó ú" },
    });
    expect(computeHmacHex(canonical, SIGNING_SECRET)).toBe(
      "d59bfc26a0095ef1f23708564f8bc60bf8694409092617b002b52cfd21cfa58b",
    );
  });
});

describe("createAppointment integration — buildSignedRequest → transport → verify (Unicode)", () => {
  /**
   * Reproduces the real createAppointment payload end-to-end exactly as
   * AppsScriptCrmClient sends it: buildSignedRequest -> JSON.stringify (the
   * HTTP body) -> JSON.parse (what Apps Script's doPost receives) ->
   * canonical string reconstruction -> HMAC verification. This isolates the
   * Next.js-side transport pipeline: it proves JSON.stringify/JSON.parse is
   * lossless for Unicode and that buildSignedRequest signs the exact object
   * that gets serialized. It does not by itself catch the Apps Script-side
   * charset bug (apps-script/Tests.gs's Vector 4-7 tests do that) — Node's
   * crypto.createHmac(...).update(str, "utf8") was never the buggy side.
   */
  it("round-trips Unicode customerNotes through JSON.stringify/JSON.parse without altering the signature", () => {
    const payload = {
      idempotencyKey: "11111111-2222-4333-8444-555555555555",
      serviceId: "svc_demo",
      barberId: "barber_demo",
      localDate: "2026-07-30",
      localStartTime: "11:30",
      customer: { name: "José Núñez", phoneE164: "+59170000000" },
      customerNotes: "Género indicado por el cliente: Hombre.",
      source: "WEBSITE",
    };

    const envelope = buildSignedRequest("createAppointment", payload, "test-api-key", SIGNING_SECRET);

    // What appsScriptClient.ts actually sends as the HTTP body.
    const wireBody = JSON.stringify(envelope);
    // What Apps Script's doPost receives via JSON.parse(e.postData.contents).
    const received = JSON.parse(wireBody);

    expect(received.payload.customerNotes).toBe(payload.customerNotes);

    const reconstructedCanonical = buildCanonicalString({
      version: received.version,
      timestamp: received.timestamp,
      nonce: received.nonce,
      requestId: received.requestId,
      action: received.action,
      payload: received.payload,
    });
    const recomputedSignature = computeHmacHex(reconstructedCanonical, SIGNING_SECRET);

    expect(recomputedSignature).toBe(received.signature);
    expect(recomputedSignature).toBe(envelope.signature);
  });
});
