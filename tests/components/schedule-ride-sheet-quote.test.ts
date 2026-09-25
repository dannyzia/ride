/**
 * Plan-05 W1 rework: ScheduleRideSheet shows an advisory pre-booking fare
 * quote by reusing the EXISTING /api/ride/estimate endpoint — no client-side
 * fare math anywhere.
 *
 * Source-scan tier guards the wiring invariants:
 *  - the sheet's quote comes from POST /api/ride/estimate (never a second
 *    calculator: no local fare formulas in the component)
 *  - estimateContext is optional — existing consumers without it are
 *    unaffected (additive prop)
 *  - the quote is advisory: fetch failure must not block confirmation
 *    (no disabled/canConfirm coupling to the quote state)
 *  - stale-response guard: a seq counter prevents out-of-order fetches
 *
 * Logic tier exercises extractQuoteTaka (the estimate-response → taka
 * projection, vehicle-matched, paisa → taka).
 */
import fs from "fs";
import path from "path";
import { extractQuoteTaka } from "@/lib/estimateQuote";

const SHEET = path.resolve(__dirname, "../../components/ScheduleRideSheet.tsx");
const sheetSource = fs.readFileSync(SHEET, "utf8");

describe("ScheduleRideSheet pre-booking quote — source contract (Plan-05 W1)", () => {
  it("fetches the quote from the EXISTING estimate endpoint", () => {
    expect(sheetSource).toContain("/api/ride/estimate");
    expect(sheetSource).toContain('method: "POST"');
  });

  it("contains no client-side fare math (no second calculator)", () => {
    // Fare libs must not leak into the component — the estimate endpoint is
    // the single source of the quote.
    expect(sheetSource).not.toContain("calculateFare");
    expect(sheetSource).not.toContain("calculateV6Fare");
    expect(sheetSource).not.toContain("per_km_bdt");
    expect(sheetSource).not.toContain("base_fare_bdt");
  });

  it("estimateContext is an optional prop (additive — old consumers unaffected)", () => {
    expect(sheetSource).toMatch(/estimateContext\?:\s*\{/);
  });

  it("quote is advisory — confirmation is never disabled by quote state", () => {
    // canConfirm must not reference the quote/fetch state
    const canConfirmLine = sheetSource
      .split("\n")
      .find((l) => l.includes("const canConfirm"));
    expect(canConfirmLine).toBeDefined();
    expect(canConfirmLine).not.toContain("quoteTaka");
    expect(canConfirmLine).not.toContain("fetchingQuote");
  });

  it("guards against stale estimate responses with a sequence ref", () => {
    expect(sheetSource).toContain("quoteSeqRef");
  });

  it("resolves the new quote strings through i18n (both locales)", () => {
    expect(sheetSource).toContain('t("schedule_ride.checking_fare")');
    expect(sheetSource).toContain('t("schedule_ride.estimated_fare")');
    // the raw literals must be gone from the component
    expect(sheetSource).not.toContain("Checking fare");
    expect(sheetSource).not.toContain("Estimated Fare\n");
    for (const locale of ["en", "bn"]) {
      const json = JSON.parse(
        fs.readFileSync(
          path.resolve(__dirname, `../../i18n/locales/${locale}/common.json`),
          "utf8",
        ),
      );
      expect(typeof json.schedule_ride.checking_fare).toBe("string");
      expect(typeof json.schedule_ride.estimated_fare).toBe("string");
    }
  });

  it("converts paisa to taka only at display (projection lives in lib/estimateQuote)", () => {
    const libSource = fs.readFileSync(
      path.resolve(__dirname, "../../lib/estimateQuote.ts"),
      "utf8",
    );
    expect(libSource).toContain("totalPaisa / 100");
  });
});

describe("extractQuoteTaka (estimate response → taka)", () => {
  it("picks the vehicle-matched estimate when requested", () => {
    const data = {
      estimates: [
        { vehicle_type: "bike_basic", total_bdt: 15_000 },
        { vehicle_type: "car_economy", total_bdt: 40_000 },
      ],
    };
    expect(extractQuoteTaka(data, "car_economy")).toBe(400); // paisa → taka
  });

  it("falls back to the first (cheapest-sorted) estimate without a vehicle type", () => {
    const data = {
      estimates: [{ vehicle_type: "bike_basic", total_bdt: 15_000 }],
    };
    expect(extractQuoteTaka(data)).toBe(150);
  });

  it("returns null for missing/malformed/zero-negative payloads", () => {
    expect(extractQuoteTaka(undefined)).toBeNull();
    expect(extractQuoteTaka({})).toBeNull();
    expect(extractQuoteTaka({ estimates: [] })).toBeNull();
    expect(extractQuoteTaka({ estimates: [{ vehicle_type: "bike_basic" }] })).toBeNull();
    expect(extractQuoteTaka({ estimates: [{ total_bdt: -5 }] })).toBeNull();
    expect(extractQuoteTaka({ estimates: [{ total_bdt: "150" }] })).toBeNull();
  });
});
