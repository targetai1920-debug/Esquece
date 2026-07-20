import { describe, expect, it } from "vitest";
import { normalizeWaId } from "@/lib/whatsapp/phone";

describe("normalizeWaId", () => {
  it("strips a leading plus sign", () => {
    expect(normalizeWaId("+59171234567")).toBe("59171234567");
  });

  it("strips internal and surrounding whitespace", () => {
    expect(normalizeWaId(" 591 71234567 ")).toBe("59171234567");
  });

  it("returns null for empty input", () => {
    expect(normalizeWaId("")).toBeNull();
    expect(normalizeWaId(null)).toBeNull();
    expect(normalizeWaId(undefined)).toBeNull();
  });

  it("returns null when the value is only whitespace/plus signs", () => {
    expect(normalizeWaId("  + ")).toBeNull();
  });

  it("leaves an already-normalized number unchanged", () => {
    expect(normalizeWaId("59171234567")).toBe("59171234567");
  });
});
