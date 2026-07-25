import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { _resetEnvCacheForTests } from "@/lib/env/server";
import { buildCanonicalString, computeHmacHex, type SignedRequestEnvelope } from "@/lib/crm/signing";
import { AppsScriptCrmClient } from "@/lib/crm/appsScriptClient";
import type { CreateAppointmentInput } from "@/lib/crm/types";

/**
 * Regression test for the production bug: AppsScriptCrmClient.call() used to
 * build the signed envelope (nonce/requestId/timestamp/signature) once,
 * outside the retryable `attempt` closure, so a retried attempt resent the
 * exact same envelope. Apps Script's replay protection (apps-script/
 * Security.gs) correctly rejects a reused nonce with NONCE_REUSED — so
 * every retry failed the same way in production ("This request was already
 * used."). The fix builds a fresh envelope inside `attempt()` on every
 * physical HTTP call, while the logical action/payload (and therefore an
 * idempotencyKey inside it) stay identical across attempts.
 */

const SIGNING_SECRET = "test-signing-secret-at-least-this-long";
const API_KEY = "test-api-key";

process.env.CRM_PROVIDER = "appscript";
process.env.CRM_APPS_SCRIPT_URL = "https://script.google.com/macros/s/fake/exec";
process.env.CRM_API_KEY = API_KEY;
process.env.CRM_SIGNING_SECRET = SIGNING_SECRET;
process.env.CRM_REQUEST_TIMEOUT_MS = "5000";

function parseSentBody(call: unknown[]): SignedRequestEnvelope {
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string) as SignedRequestEnvelope;
}

function envelopeSignatureIsValid(envelope: SignedRequestEnvelope): boolean {
  const canonical = buildCanonicalString(envelope);
  return computeHmacHex(canonical, SIGNING_SECRET) === envelope.signature;
}

describe("AppsScriptCrmClient retry builds a fresh signed envelope per attempt", () => {
  beforeEach(() => {
    _resetEnvCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("retries createAppointment with a new nonce/requestId/signature but the same action, payload and idempotencyKey", async () => {
    const input: CreateAppointmentInput = {
      idempotencyKey: "idem-key-abc-123",
      source: "WEBSITE",
      serviceId: "svc_1",
      barberId: "brb_1",
      localDate: "2026-07-27",
      localStartTime: "10:00",
      customer: { name: "Juan Pérez", phoneE164: "+59170012345" },
      customerNotes: "sin gel",
    };

    const successBody = {
      ok: true,
      requestId: "server-request-id",
      data: {
        appointment: {
          appointmentId: "apt_1",
          reference: "ESQ-20260727-AB12",
          idempotencyKey: input.idempotencyKey,
          customerId: "cus_1",
          serviceId: input.serviceId,
          barberId: input.barberId,
          localDate: input.localDate,
          localStartTime: input.localStartTime,
          localEndTime: "10:45",
          status: "CONFIRMED",
          source: "WEBSITE",
        },
        managementToken: "raw-token",
        idempotent: false,
      },
      error: null,
    };

    const fetchMock = vi
      .fn()
      // First physical HTTP call: a transport failure — retryable (mirrors
      // the real client's CRM_UNREACHABLE mapping for a rejected fetch).
      .mockRejectedValueOnce(new Error("network down"))
      // Second physical HTTP call: succeeds.
      .mockResolvedValueOnce({
        json: async () => successBody,
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = new AppsScriptCrmClient();
    const result = await client.createAppointment(input);

    // A second attempt actually happened.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.appointment.reference).toBe("ESQ-20260727-AB12");

    const envelope1 = parseSentBody(fetchMock.mock.calls[0]);
    const envelope2 = parseSentBody(fetchMock.mock.calls[1]);

    // Same logical request on both attempts.
    expect(envelope2.action).toBe(envelope1.action);
    expect(envelope1.action).toBe("createAppointment");
    expect(envelope2.payload).toEqual(envelope1.payload);
    expect((envelope2.payload as CreateAppointmentInput).idempotencyKey).toBe(input.idempotencyKey);
    expect((envelope1.payload as CreateAppointmentInput).idempotencyKey).toBe(input.idempotencyKey);

    // Different transport envelope on each attempt — this is the actual fix.
    expect(envelope2.nonce).not.toBe(envelope1.nonce);
    expect(envelope2.requestId).not.toBe(envelope1.requestId);
    expect(envelope2.signature).not.toBe(envelope1.signature);

    // Both signatures must independently verify against their own envelope
    // (i.e. neither is a stale/reused signature from the other attempt).
    expect(envelopeSignatureIsValid(envelope1)).toBe(true);
    expect(envelopeSignatureIsValid(envelope2)).toBe(true);
  });
});
