/**
 * B-3 resolution (2026-10-04): "schedule for later" is a BUILD, not a retire.
 *
 * WHY THIS FILE EXISTS. The scheduled-ride feature is server-complete
 * (POST /api/ride/schedule — 30min–7d lead, overlap 409, status 'scheduled';
 * utils-server/scheduler.ts promotes scheduled → finding) and a full schedule
 * screen already exists. It was orphaned when confirm-ride/ was deleted
 * (G-02b), which owned the only pre-booking affordance. The fix adds the entry
 * point on the live booking sheet and hands off to the existing screen — no
 * duplicate submission logic, no new scheduling code.
 *
 * This source-contract tier guards the wiring invariants that cannot be
 * exercised without a device (device day is ENV-blocked):
 *  - the affordance exists on the home sheet and opens the schedule screen
 *  - home does NOT reimplement the POST — the schedule screen owns it
 *  - pickup/destination/vehicle carry over through the shared stores
 *  - the label resolves in both locales
 *  - the Maestro flow is unblocked and addresses only live selectors
 */
import fs from "fs";
import path from "path";

const HOME = path.resolve(
  __dirname,
  "../../app/(main)/(customer)/(tabs)/home/index.tsx",
);
const SCHEDULE = path.resolve(
  __dirname,
  "../../app/(main)/(customer)/schedule-ride/index.tsx",
);
const FLOW = path.resolve(
  __dirname,
  "../../maestro/flows/rider/booking/05-scheduled-ride.yaml",
);

const homeSource = fs.readFileSync(HOME, "utf8");
const scheduleSource = fs.readFileSync(SCHEDULE, "utf8");
const flowSource = fs.readFileSync(FLOW, "utf8");

describe("booking sheet → schedule entry (B-3 resolved BUILD)", () => {
  it("exposes the affordance on the booking sheet and opens the schedule screen", () => {
    expect(homeSource).toContain('testID="customer.home.push-schedule-ride"');
    expect(homeSource).toContain(
      'router.push("/(main)/(customer)/schedule-ride")',
    );
  });

  it("does not reimplement scheduling in the home sheet — one POST path", () => {
    expect(homeSource).not.toContain("/api/ride/schedule");
    expect(scheduleSource).toContain("/api/ride/schedule");
  });

  it("carries pickup/destination/vehicle over through the shared stores", () => {
    expect(homeSource).toContain("setUserLocation({");
    expect(homeSource).toContain("setDestinationLocation({");
    expect(scheduleSource).toContain("useCustomer()");
    expect(scheduleSource).toContain("selectedVehicleType: storeVehicleType");
  });

  it("resolves the affordance label through i18n in both locales", () => {
    expect(homeSource).toContain("t('schedule_ride.schedule_for_later')");
    for (const locale of ["en", "bn"]) {
      const json = JSON.parse(
        fs.readFileSync(
          path.resolve(__dirname, `../../i18n/locales/${locale}/common.json`),
          "utf8",
        ),
      );
      expect(typeof json.schedule_ride.schedule_for_later).toBe("string");
      expect(json.schedule_ride.schedule_for_later.length).toBeGreaterThan(0);
    }
  });

  it("keeps the Maestro flow unblocked and on live selectors", () => {
    expect(flowSource).not.toMatch(/tags:\s*\[[^\]]*blocked/);
    for (const id of [
      "customer.home.push-schedule-ride",
      "customer.schedule-ride.handle-schedule",
      "customer.ride-scheduled.set-theme",
    ]) {
      expect(flowSource).toContain(id);
    }
    expect(flowSource).not.toContain("customer.confirm-ride.");
  });
});
