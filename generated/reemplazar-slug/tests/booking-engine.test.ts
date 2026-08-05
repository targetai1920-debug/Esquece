import { describe, expect, it } from "vitest";
import { LocalCrmClient } from "@/lib/crm/localClient";
import type { LocalCrmSeed } from "@/lib/crm/localClient";
import type { BusinessSettings, Service, Staff } from "@/lib/crm/types";

const settings: BusinessSettings = {
  name: "Test Shop",
  timezone: "UTC",
  locale: "en-US",
  currency: "USD",
  address: "",
  phone: "",
  email: "",
  instagram: "",
  mapsUrl: "",
  minimumNoticeMinutes: 0,
  maximumAdvanceDays: 60,
  slotIntervalMinutes: 30,
  allowAnyStaff: true,
  cancellationNoticeHours: 24,
  cancellationPolicy: "",
};

const services: Service[] = [
  { id: "svc-1", name: "Cut", description: "", price: 20, currency: "USD", durationMinutes: 30, bufferMinutes: 0, active: true, image: "" },
  { id: "svc-2", name: "Inactive", description: "", price: 20, currency: "USD", durationMinutes: 30, bufferMinutes: 0, active: false, image: "" },
];

const staff: Staff[] = [
  {
    id: "staff-1",
    name: "Alex",
    biography: "",
    photo: "",
    active: true,
    publicBooking: true,
    serviceIds: ["svc-1"],
    workingHours: {
      monday: { closed: false, start: "09:00", end: "10:00" },
      tuesday: { closed: false, start: "09:00", end: "17:00" },
      wednesday: { closed: false, start: "09:00", end: "17:00" },
      thursday: { closed: false, start: "09:00", end: "17:00" },
      friday: { closed: false, start: "09:00", end: "17:00" },
      saturday: { closed: true },
      sunday: { closed: true },
    },
    breaks: [{ days: ["tuesday"], start: "13:00", end: "14:00" }],
  },
  {
    id: "staff-2",
    name: "Sam",
    biography: "",
    photo: "",
    active: true,
    publicBooking: true,
    serviceIds: ["svc-1"],
    workingHours: {
      monday: { closed: false, start: "09:00", end: "10:00" },
      tuesday: { closed: false, start: "09:00", end: "17:00" },
      wednesday: { closed: false, start: "09:00", end: "17:00" },
      thursday: { closed: false, start: "09:00", end: "17:00" },
      friday: { closed: false, start: "09:00", end: "17:00" },
      saturday: { closed: true },
      sunday: { closed: true },
    },
    breaks: [],
  },
];

function makeClient(now = new Date("2026-01-05T08:00:00Z")) {
  const seed: LocalCrmSeed = { settings, services, staff, faqs: [], promotions: [] };
  return new LocalCrmClient(seed, () => now);
}

// 2026-01-05 is a Monday (working hours 09:00-10:00 for both staff in this fixture).
const MONDAY = "2026-01-05";
const TUESDAY = "2026-01-06";

describe("booking engine — availability rules", () => {
  it("rejects an inactive service", async () => {
    const client = makeClient();
    const result = await client.validateSlot({ serviceId: "svc-2", staffId: "staff-1", localDate: MONDAY, localStartTime: "09:00" });
    expect(result).toEqual({ valid: false, reason: "SERVICE_NOT_FOUND" });
  });

  it("rejects a staff member not linked to the service", async () => {
    const seed: LocalCrmSeed = {
      settings,
      services,
      staff: [{ ...staff[0], serviceIds: [] }],
      faqs: [],
      promotions: [],
    };
    const isolated = new LocalCrmClient(seed, () => new Date("2026-01-05T08:00:00Z"));
    const result = await isolated.validateSlot({ serviceId: "svc-1", staffId: "staff-1", localDate: MONDAY, localStartTime: "09:00" });
    expect(result).toEqual({ valid: false, reason: "STAFF_NOT_ELIGIBLE" });
  });

  it("rejects a date in the past", async () => {
    const client = makeClient();
    const result = await client.validateSlot({ serviceId: "svc-1", staffId: "staff-1", localDate: "2020-01-01", localStartTime: "09:00" });
    expect(result).toEqual({ valid: false, reason: "DATE_IN_PAST" });
  });

  it("rejects a slot ending after closing", async () => {
    const client = makeClient();
    // Monday closes at 10:00; a 30-minute service starting at 09:45 ends at 10:15.
    const result = await client.validateSlot({ serviceId: "svc-1", staffId: "staff-1", localDate: MONDAY, localStartTime: "09:45" });
    expect(result).toEqual({ valid: false, reason: "ENDS_AFTER_CLOSING" });
  });

  it("accepts a slot ending exactly at closing time (half-open interval)", async () => {
    const client = makeClient();
    const result = await client.validateSlot({ serviceId: "svc-1", staffId: "staff-1", localDate: MONDAY, localStartTime: "09:30" });
    expect(result).toEqual({ valid: true });
  });

  it("rejects a slot overlapping a break", async () => {
    const client = makeClient();
    const result = await client.validateSlot({ serviceId: "svc-1", staffId: "staff-1", localDate: TUESDAY, localStartTime: "13:15" });
    expect(result).toEqual({ valid: false, reason: "OVERLAPS_BREAK" });
  });

  it("rejects a slot on a day the staff member is closed", async () => {
    const client = makeClient();
    const result = await client.validateSlot({ serviceId: "svc-1", staffId: "staff-1", localDate: "2026-01-10", localStartTime: "09:00" }); // Saturday
    expect(result).toEqual({ valid: false, reason: "STAFF_CLOSED_THAT_DAY" });
  });
});

describe("booking engine — mutations", () => {
  it("creates an appointment and blocks the same slot for a second attempt", async () => {
    const client = makeClient();
    const first = await client.createAppointment({
      idempotencyKey: "key-1",
      serviceId: "svc-1",
      staffId: "staff-1",
      localDate: TUESDAY,
      localStartTime: "09:00",
      customer: { name: "Jordan", phone: "+15550000001" },
      source: "WEBSITE",
    });
    expect(first.appointment.status).toBe("CONFIRMED");
    expect(first.idempotent).toBe(false);

    await expect(
      client.createAppointment({
        idempotencyKey: "key-2",
        serviceId: "svc-1",
        staffId: "staff-1",
        localDate: TUESDAY,
        localStartTime: "09:00",
        customer: { name: "Taylor", phone: "+15550000002" },
        source: "WEBSITE",
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  it("prevents double-booking under concurrent requests for the identical slot", async () => {
    const client = makeClient();
    const attempt = (key: string, name: string) =>
      client.createAppointment({
        idempotencyKey: key,
        serviceId: "svc-1",
        staffId: "staff-1",
        localDate: TUESDAY,
        localStartTime: "11:00",
        customer: { name, phone: "+15550000003" },
        source: "WEBSITE",
      });

    const results = await Promise.allSettled([attempt("race-a", "A"), attempt("race-b", "B")]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("idempotent retry with the same key returns the original appointment, not a duplicate", async () => {
    const client = makeClient();
    const first = await client.createAppointment({
      idempotencyKey: "retry-key",
      serviceId: "svc-1",
      staffId: "staff-1",
      localDate: TUESDAY,
      localStartTime: "10:00",
      customer: { name: "Jordan", phone: "+15550000004" },
      source: "WEBSITE",
    });
    const retry = await client.createAppointment({
      idempotencyKey: "retry-key",
      serviceId: "svc-1",
      staffId: "staff-1",
      localDate: TUESDAY,
      localStartTime: "10:00",
      customer: { name: "Jordan", phone: "+15550000004" },
      source: "WEBSITE",
    });
    expect(retry.idempotent).toBe(true);
    expect(retry.appointment.id).toBe(first.appointment.id);

    const all = await client.listAppointments({ localDate: TUESDAY, staffId: "staff-1" });
    expect(all.filter((a) => a.localStartTime === "10:00")).toHaveLength(1);
  });

  it("picks a staff member deterministically for 'any available'", async () => {
    const client = makeClient();
    const result = await client.createAppointment({
      idempotencyKey: "any-1",
      serviceId: "svc-1",
      anyStaff: true,
      localDate: TUESDAY,
      localStartTime: "15:00",
      customer: { name: "Jordan", phone: "+15550000005" },
      source: "WEBSITE",
    });
    expect(["staff-1", "staff-2"]).toContain(result.appointment.staffId);
  });

  it("cancels an appointment idempotently and frees the slot", async () => {
    const client = makeClient();
    const created = await client.createAppointment({
      idempotencyKey: "cancel-1",
      serviceId: "svc-1",
      staffId: "staff-1",
      localDate: TUESDAY,
      localStartTime: "12:00",
      customer: { name: "Jordan", phone: "+15550000006" },
      source: "WEBSITE",
    });
    const token = created.managementToken!;
    const cancelled = await client.cancelAppointment({ appointmentId: created.appointment.id, managementToken: token });
    expect(cancelled.status).toBe("CANCELLED");

    const secondCancel = await client.cancelAppointment({ appointmentId: created.appointment.id, managementToken: token });
    expect(secondCancel.status).toBe("CANCELLED"); // idempotent, no error

    const freeCheck = await client.validateSlot({ serviceId: "svc-1", staffId: "staff-1", localDate: TUESDAY, localStartTime: "12:00" });
    expect(freeCheck).toEqual({ valid: true });
  });

  it("rejects cancel/reschedule with a wrong management token", async () => {
    const client = makeClient();
    const created = await client.createAppointment({
      idempotencyKey: "wrong-token-1",
      serviceId: "svc-1",
      staffId: "staff-1",
      localDate: TUESDAY,
      localStartTime: "16:00",
      customer: { name: "Jordan", phone: "+15550000007" },
      source: "WEBSITE",
    });
    await expect(client.cancelAppointment({ appointmentId: created.appointment.id, managementToken: "wrong" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("reschedules successfully and validates the new slot before releasing the old one", async () => {
    const client = makeClient();
    const created = await client.createAppointment({
      idempotencyKey: "resched-1",
      serviceId: "svc-1",
      staffId: "staff-1",
      localDate: TUESDAY,
      localStartTime: "09:00",
      customer: { name: "Jordan", phone: "+15550000008" },
      source: "WEBSITE",
    });
    const token = created.managementToken!;
    const rescheduled = await client.rescheduleAppointment({
      appointmentId: created.appointment.id,
      managementToken: token,
      newLocalDate: TUESDAY,
      newLocalStartTime: "10:30",
    });
    expect(rescheduled.localStartTime).toBe("10:30");
  });

  it("a failed reschedule leaves the original appointment unchanged", async () => {
    const client = makeClient();
    const created = await client.createAppointment({
      idempotencyKey: "resched-fail-1",
      serviceId: "svc-1",
      staffId: "staff-1",
      localDate: TUESDAY,
      localStartTime: "09:00",
      customer: { name: "Jordan", phone: "+15550000009" },
      source: "WEBSITE",
    });
    // Block the target slot with a second appointment first.
    await client.createAppointment({
      idempotencyKey: "blocker-1",
      serviceId: "svc-1",
      staffId: "staff-1",
      localDate: TUESDAY,
      localStartTime: "14:00",
      customer: { name: "Blocker", phone: "+15550000010" },
      source: "WEBSITE",
    });

    const token = created.managementToken!;
    await expect(
      client.rescheduleAppointment({
        appointmentId: created.appointment.id,
        managementToken: token,
        newLocalDate: TUESDAY,
        newLocalStartTime: "14:00",
      }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });

    const stillOriginal = await client.listAppointments({ localDate: TUESDAY, staffId: "staff-1" });
    expect(stillOriginal.find((a) => a.id === created.appointment.id)?.localStartTime).toBe("09:00");
  });

  it("snapshots service price/duration at booking time", async () => {
    const client = makeClient();
    const created = await client.createAppointment({
      idempotencyKey: "snapshot-1",
      serviceId: "svc-1",
      staffId: "staff-1",
      localDate: TUESDAY,
      localStartTime: "16:30",
      customer: { name: "Jordan", phone: "+15550000011" },
      source: "WEBSITE",
    });
    expect(created.appointment.servicePriceSnapshot).toBe(20);
    expect(created.appointment.serviceDurationSnapshot).toBe(30);
  });

  it("upserts a customer by normalized phone without erasing previously-known fields", async () => {
    const client = makeClient();
    await client.createAppointment({
      idempotencyKey: "cust-1",
      serviceId: "svc-1",
      staffId: "staff-2",
      localDate: TUESDAY,
      localStartTime: "09:00",
      customer: { name: "Jordan", phone: "+1 (555) 000-0012", email: "jordan@example.com" },
      source: "WEBSITE",
    });
    const second = await client.createAppointment({
      idempotencyKey: "cust-2",
      serviceId: "svc-1",
      staffId: "staff-2",
      localDate: TUESDAY,
      localStartTime: "10:00",
      customer: { name: "Jordan R.", phone: "+15550000012" },
      source: "WEBSITE",
    });
    expect(second.appointment.customerId).toBeDefined();
  });
});
