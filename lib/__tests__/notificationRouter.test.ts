/**
 * F (order_id linkage + staff lane + extra-charge loop): push-tap routing.
 *
 *   - `delivery:status` carrying a leg_id deep-links to the sender's parcel
 *     tracking screen (both roles); without one it falls back to the
 *     courier inbox (driver map) or the sender's parcel list (rider map —
 *     riders cannot open the courier inbox).
 *   - `shop:staff_invite` lands on the shop surface (both maps).
 *   - `ride:extra_charge_resolved` lands the proposing driver home.
 */
import { jest } from "@jest/globals";
// SUT import above the mock block (babel hoisting keeps this runtime-safe).
import { routeNotification } from "@/lib/notificationRouter";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const LEG = "00000000-0000-4000-8000-0000000000d1";

beforeEach(() => {
  mockPush.mockClear();
});

describe("delivery:status parcel linkage", () => {
  it("rider tapping a parcel push lands on the parcel tracking screen", () => {
    expect(
      routeNotification({ type: "delivery:status", leg_id: LEG, status: "accepted" }, "rider"),
    ).toBe(true);
    expect(mockPush).toHaveBeenCalledWith(
      `/(main)/(customer)/(delivery)/request-detail?id=${LEG}`,
    );
  });

  it("driver tapping a parcel push lands on the same tracking screen", () => {
    expect(
      routeNotification({ type: "delivery:status", leg_id: LEG, status: "delivered" }, "driver"),
    ).toBe(true);
    expect(mockPush).toHaveBeenCalledWith(
      `/(main)/(customer)/(delivery)/request-detail?id=${LEG}`,
    );
  });

  it("rider fallback without a leg id is the parcel list, not the courier inbox", () => {
    expect(routeNotification({ type: "delivery:status" }, "rider")).toBe(true);
    expect(mockPush).toHaveBeenCalledWith("/(main)/(customer)/(delivery)");
  });

  it("driver fallback without a leg id stays the courier inbox", () => {
    expect(routeNotification({ type: "delivery:status" }, "driver")).toBe(true);
    expect(mockPush).toHaveBeenCalledWith("/(main)/(delivery)");
  });

  it("a malformed leg id never builds a route (no crash navigation)", () => {
    expect(
      routeNotification({ type: "delivery:status", leg_id: "not-a-uuid" }, "rider"),
    ).toBe(true);
    expect(mockPush).toHaveBeenCalledWith("/(main)/(customer)/(delivery)");
  });
});

describe("staff invite + extra-charge resolution", () => {
  it("shop:staff_invite lands on the shop surface (both roles)", () => {
    expect(routeNotification({ type: "shop:staff_invite", shop_id: LEG }, "rider")).toBe(true);
    expect(mockPush).toHaveBeenCalledWith("/(main)/(shop-owner)");
    mockPush.mockClear();
    expect(routeNotification({ type: "shop:staff_invite", shop_id: LEG }, "driver")).toBe(true);
    expect(mockPush).toHaveBeenCalledWith("/(main)/(shop-owner)");
  });

  it("ride:extra_charge_resolved lands the driver home", () => {
    expect(
      routeNotification(
        { type: "ride:extra_charge_resolved", ride_id: LEG, decision: "approved" },
        "driver",
      ),
    ).toBe(true);
    expect(mockPush).toHaveBeenCalledWith("/(main)/(rider)/d");
  });

  it("unknown types still fail safe", () => {
    expect(routeNotification({ type: "nope:unknown" }, "rider")).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
