/**
 * S8 unified eligibility suite (§6.1): single-source truth table for
 * isDriverEligibleForRideGender + isDriverSafeForRideAccept
 * (lib/womenOnlyEligibility.ts).
 *
 * Fault-pair rule: flipping any clause under test (relaxing verification,
 * ignoring the toggle, dropping the kill-switch branch, removing the R11-C1
 * scope assertion) flips the corresponding case to FAIL.
 */
import {
  isDriverEligibleForRideGender,
  isDriverSafeForRideAccept,
} from "@/lib/womenOnlyEligibility";

const BIKE = "bike_basic" as const;
const CAR = "car_compact" as const;

describe("isDriverEligibleForRideGender — women-only rides", () => {
  test("verified female driver is eligible (kill switch ON)", () => {
    expect(
      isDriverEligibleForRideGender({
        driverGender: "female",
        driverGenderVerified: true,
        driverWomenOnlyEnabled: false,
        rideWomenOnly: true,
        vehicleType: BIKE,
        womenOnlyFeatureEnabled: true,
      }),
    ).toBe(true);
  });

  test("unverified female driver is INELIGIBLE (verification is mandatory)", () => {
    expect(
      isDriverEligibleForRideGender({
        driverGender: "female",
        driverGenderVerified: false,
        driverWomenOnlyEnabled: false,
        rideWomenOnly: true,
        vehicleType: BIKE,
        womenOnlyFeatureEnabled: true,
      }),
    ).toBe(false);
  });

  test("male driver is INELIGIBLE for women-only rides", () => {
    expect(
      isDriverEligibleForRideGender({
        driverGender: "male",
        driverGenderVerified: false,
        driverWomenOnlyEnabled: false,
        rideWomenOnly: true,
        vehicleType: BIKE,
        womenOnlyFeatureEnabled: true,
      }),
    ).toBe(false);
  });

  test("in-flight women-only ride stays female-only when kill switch is OFF", () => {
    expect(
      isDriverEligibleForRideGender({
        driverGender: "female",
        driverGenderVerified: true,
        driverWomenOnlyEnabled: false,
        rideWomenOnly: true,
        vehicleType: BIKE,
        womenOnlyFeatureEnabled: false,
      }),
    ).toBe(true);
    expect(
      isDriverEligibleForRideGender({
        driverGender: "male",
        driverGenderVerified: false,
        driverWomenOnlyEnabled: false,
        rideWomenOnly: true,
        vehicleType: BIKE,
        womenOnlyFeatureEnabled: false,
      }),
    ).toBe(false);
  });

  test.each(["cng", "car_compact", "car_economy", "car_comfort", "car_premium", "car_xl"] as const)(
    "R11-C1: women_only=true on %s fails OPEN (bad DB row never restricts the pool)",
    (vt) => {
      expect(
        isDriverEligibleForRideGender({
          driverGender: "male",
          driverGenderVerified: false,
          driverWomenOnlyEnabled: false,
          rideWomenOnly: true,
          vehicleType: vt,
          womenOnlyFeatureEnabled: true,
        }),
      ).toBe(true);
    },
  );
});

describe("isDriverEligibleForRideGender — mixed rides", () => {
  test("unarmed driver is eligible for mixed bike rides", () => {
    expect(
      isDriverEligibleForRideGender({
        driverGender: "female",
        driverGenderVerified: true,
        driverWomenOnlyEnabled: false,
        rideWomenOnly: false,
        vehicleType: BIKE,
        womenOnlyFeatureEnabled: true,
      }),
    ).toBe(true);
  });

  test("armed driver self-excludes from mixed bike rides while kill switch is ON", () => {
    expect(
      isDriverEligibleForRideGender({
        driverGender: "female",
        driverGenderVerified: true,
        driverWomenOnlyEnabled: true,
        rideWomenOnly: false,
        vehicleType: BIKE,
        womenOnlyFeatureEnabled: true,
      }),
    ).toBe(false);
  });

  test("armed driver is admitted to mixed bike rides when kill switch is OFF", () => {
    expect(
      isDriverEligibleForRideGender({
        driverGender: "female",
        driverGenderVerified: true,
        driverWomenOnlyEnabled: true,
        rideWomenOnly: false,
        vehicleType: BIKE,
        womenOnlyFeatureEnabled: false,
      }),
    ).toBe(true);
  });

  test("car/CNG rides ignore the driver toggle entirely", () => {
    expect(
      isDriverEligibleForRideGender({
        driverGender: "female",
        driverGenderVerified: true,
        driverWomenOnlyEnabled: true,
        rideWomenOnly: false,
        vehicleType: CAR,
        womenOnlyFeatureEnabled: true,
      }),
    ).toBe(true);
  });
});

describe("isDriverSafeForRideAccept — match-time invariant", () => {
  test("verified female accepts a women-only ride", () => {
    expect(
      isDriverSafeForRideAccept({
        driverGender: "female",
        driverGenderVerified: true,
        rideWomenOnly: true,
      }),
    ).toBe(true);
  });

  test("unverified or male driver is UNSAFE for a women-only ride", () => {
    expect(
      isDriverSafeForRideAccept({
        driverGender: "female",
        driverGenderVerified: false,
        rideWomenOnly: true,
      }),
    ).toBe(false);
    expect(
      isDriverSafeForRideAccept({
        driverGender: "male",
        driverGenderVerified: false,
        rideWomenOnly: true,
      }),
    ).toBe(false);
  });

  test("mixed rides accept anyone (toggle is not re-checked at accept)", () => {
    expect(
      isDriverSafeForRideAccept({
        driverGender: "male",
        driverGenderVerified: false,
        rideWomenOnly: false,
      }),
    ).toBe(true);
  });
});
