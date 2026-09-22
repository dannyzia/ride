/**
 * formatBDT numbering tests (Bengali Numerals plan P1.4).
 *
 * Node/Jest has full ICU, so these prove the Intl `beng` path including
 * LAKH grouping. The Hermes device gate (plan P1.2) is verified separately
 * on-device; the default-latn contract is behavior-identical to the
 * pre-phase implementation.
 */
import { formatBDT } from "@/lib/format";

describe("formatBDT — default latn (behavior-identical contract)", () => {
  it("formats whole taka with Western digits and lakh grouping", () => {
    expect(formatBDT(123456700)).toBe("৳12,34,567");
  });

  it("keeps latn digits when explicitly requested", () => {
    expect(formatBDT(123456700, { numbering: "latn" })).toBe("৳12,34,567");
  });

  it("latn lakh grouping: 123456.78 taka", () => {
    expect(formatBDT(12345678, { decimals: true })).toBe("৳1,23,456.78");
  });
});

describe("formatBDT — beng numbering (digits AND lakh grouping)", () => {
  it("renders Bengali digits with lakh grouping", () => {
    // P1.4 explicit grouping assertion: 1234567 taka → ৳১২,৩৪,৫৬৭
    expect(formatBDT(123456700, { numbering: "beng" })).toBe("৳১২,৩৪,৫৬৭");
  });

  it("renders decimals in Bengali digits", () => {
    expect(formatBDT(12345678, { numbering: "beng", decimals: true })).toBe(
      "৳১,২৩,৪৫৬.৭৮",
    );
  });

  it("small amounts", () => {
    expect(formatBDT(500, { numbering: "beng" })).toBe("৳৫");
    expect(formatBDT(12345, { numbering: "beng", decimals: true })).toBe(
      "৳১২৩.৪৫",
    );
  });
});

describe("formatBDT — edge cases (both numbering systems)", () => {
  it("negatives keep the leading minus", () => {
    expect(formatBDT(-123456700)).toBe("-৳12,34,567");
    expect(formatBDT(-123456700, { numbering: "beng" })).toBe("-৳১২,৩৪,৫৬৭");
  });

  it("null/undefined/NaN → em-dash fallback", () => {
    expect(formatBDT(null)).toBe("—");
    expect(formatBDT(undefined)).toBe("—");
    expect(formatBDT(Number.NaN)).toBe("—");
    expect(formatBDT(null, { numbering: "beng" })).toBe("—");
  });

  it("zero", () => {
    expect(formatBDT(0)).toBe("৳0");
    expect(formatBDT(0, { numbering: "beng" })).toBe("৳০");
  });
});
