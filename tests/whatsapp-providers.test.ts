import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyMetaSignature, verifyTokenMatches } from "@/lib/whatsapp/signature";
import { MockWhatsAppProvider } from "@/lib/whatsapp/mockProvider";

describe("WhatsApp signature verification", () => {
  const secret = "shhh";
  const body = '{"object":"whatsapp_business_account"}';
  const validSig = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

  it("accepts a correctly computed signature", () => {
    expect(verifyMetaSignature(body, validSig, secret)).toBe(true);
  });

  it("rejects a tampered body against the original signature", () => {
    expect(verifyMetaSignature(body + "x", validSig, secret)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    expect(verifyMetaSignature(body, "not-a-real-signature", secret)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verifyMetaSignature(body, validSig, "wrong-secret")).toBe(false);
  });
});

describe("verify-token comparison", () => {
  it("matches the correct token", () => {
    expect(verifyTokenMatches("correct-token", "correct-token")).toBe(true);
  });
  it("rejects an incorrect token", () => {
    expect(verifyTokenMatches("wrong", "correct-token")).toBe(false);
  });
  it("rejects a null token", () => {
    expect(verifyTokenMatches(null, "correct-token")).toBe(false);
  });
});

describe("MockWhatsAppProvider", () => {
  it("records sent text messages", async () => {
    const provider = new MockWhatsAppProvider();
    const result = await provider.sendText("59171234567", "Hola");
    expect(result.messageId).toBeTruthy();
    expect(provider.sentMessages).toHaveLength(1);
    expect(provider.sentMessages[0]).toMatchObject({ to: "59171234567", kind: "text", body: "Hola" });
  });

  it("can be made to fail on the next send, for simulating a WhatsApp outage", async () => {
    const provider = new MockWhatsAppProvider();
    provider.failNextSend = true;
    await expect(provider.sendText("59171234567", "Hola")).rejects.toThrow();
    // Failure is one-shot — the next call succeeds normally.
    await expect(provider.sendText("59171234567", "Hola de nuevo")).resolves.toMatchObject({});
  });

  it("records interactive buttons and lists with their option titles", async () => {
    const provider = new MockWhatsAppProvider();
    await provider.sendInteractiveButtons("59171234567", "Elige uno", [{ id: "a", title: "Opción A" }]);
    await provider.sendInteractiveList("59171234567", "Elige uno", "Ver opciones", [{ rows: [{ id: "b", title: "Opción B" }] }]);
    expect(provider.sentMessages[0].body).toContain("Opción A");
    expect(provider.sentMessages[1].body).toContain("Opción B");
  });
});
