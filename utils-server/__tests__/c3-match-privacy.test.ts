/**
 * C3-6 (STAGE C3-FIX, PRIVACY): the rider-facing match card must NEVER
 * carry the driver's raw phone — in-app chat is the contact channel, masked
 * call is DEFERRED (D-x, provider). Pins the builder both ways: the card has
 * no phone key, and even a hostile input row with a phone cannot smuggle one
 * through (the builder picks fields, never spreads).
 */
import { buildMatchedDriverCard } from "../matchPayload";

describe("buildMatchedDriverCard (C3-6 match privacy)", () => {
  it("carries name/rating/vehicle_type and no phone key", () => {
    const card = buildMatchedDriverCard({
      name: "Kamal",
      rating: "4.80",
      vehicle_type: "cng",
    });
    expect(card).toEqual({ name: "Kamal", rating: 4.8, vehicle_type: "cng" });
    expect("phone" in card).toBe(false);
    expect(card).not.toHaveProperty("phone");
  });

  it("drops a phone present on the input row (pick, never spread)", () => {
    const hostileRow = {
      name: "Kamal",
      rating: "4.80",
      vehicle_type: "cng",
      phone: "+880170000000",
    };
    const card = buildMatchedDriverCard(hostileRow);
    expect("phone" in card).toBe(false);
    expect(JSON.stringify(card)).not.toContain("+880170000000");
  });

  it("is null-safe: missing row yields an empty card, still phoneless", () => {
    for (const row of [undefined, null, {}] as const) {
      const card = buildMatchedDriverCard(row);
      expect(card).toEqual({ name: "", rating: null, vehicle_type: "" });
      expect("phone" in card).toBe(false);
    }
  });

  it("passes numeric ratings through untouched", () => {
    expect(buildMatchedDriverCard({ rating: 4.5 }).rating).toBe(4.5);
  });
});
