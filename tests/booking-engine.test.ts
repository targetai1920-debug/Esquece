import { describe, expect, it } from "vitest";
import {
  createAppointment,
  getAvailableSlots,
  NotImplementedError,
} from "@/lib/booking-engine";

describe("booking-engine stubs (Phase 1)", () => {
  it("getAvailableSlots validates its input before failing", async () => {
    // @ts-expect-error deliberately missing required fields
    await expect(getAvailableSlots({})).rejects.not.toBeInstanceOf(NotImplementedError);
  });

  it("getAvailableSlots throws NotImplementedError for well-formed input", async () => {
    await expect(
      getAvailableSlots({
        businessId: "biz_1",
        serviceId: "svc_1",
        barber: { anyAvailable: true },
        dateRange: { from: new Date(), to: new Date() },
      }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("createAppointment throws NotImplementedError for well-formed input, not a fabricated booking", async () => {
    await expect(
      createAppointment({
        businessId: "biz_1",
        serviceId: "svc_1",
        barberId: "barber_1",
        startTime: new Date(),
        customer: { name: "Demo", phone: "59171234567" },
        source: "WHATSAPP",
      }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });
});
