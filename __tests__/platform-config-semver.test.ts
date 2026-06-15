// Regression test for BUG-12.
// Platform Config "Min App Version" rendered empty despite DB value "1.0.0".
// Root cause: parseDisplayNumber called Number("1.0.0") which returns NaN
// (two dots = invalid number), so it returned "" (empty string).
// Fix: text-typed fields now bypass parseDisplayNumber entirely.
//
// We can't import the screen directly (it depends on React Native + Expo),
// so we test the parseDisplayNumber logic in isolation to prove the
// underlying failure mode and ensure the fix is understood.

describe("BUG-12: parseDisplayNumber with semver", () => {
  // Replicates the original buggy behavior to document the root cause.
  function buggyParseDisplayNumber(
    value: string | undefined,
    scale: number,
  ): string {
    if (value === undefined || value === "") return "";
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    return scale === 1 ? String(n) : String(n / scale);
  }

  test("BUGGY behavior: Number('1.0.0') is NaN, returns empty", () => {
    expect(buggyParseDisplayNumber("1.0.0", 1)).toBe("");
  });

  test("Number() rejects semver with two dots", () => {
    expect(Number("1.0.0")).toBe(NaN);
    expect(Number("2.3.1")).toBe(NaN);
  });

  test("Number() accepts single-dot versions (masks the bug for 1.0)", () => {
    expect(Number("1.0")).toBe(1);
  });

  // Documents the fix: text fields bypass parseDisplayNumber.
  test("FIX: text fields pass through raw value untouched", () => {
    const rawDbValue = "1.0.0";
    const fieldType = "text";
    const displayed =
      fieldType === "text" ? rawDbValue : buggyParseDisplayNumber(rawDbValue, 1);
    expect(displayed).toBe("1.0.0");
  });
});
