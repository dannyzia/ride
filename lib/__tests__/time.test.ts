import { bdtDayBoundariesUtc, prevBdtMidnightUtc, nextBdtMidnightUtc } from "@/lib/time";

describe("bdtDayBoundariesUtc", () => {
  it("returns UTC boundaries for a Dhaka calendar day (UTC+6)", () => {
    const { start, end } = bdtDayBoundariesUtc("2026-08-17")!;
    expect(start.toISOString()).toBe("2026-08-16T18:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-17T18:00:00.000Z");
  });

  it("spans exactly 24 hours", () => {
    const { start, end } = bdtDayBoundariesUtc("2026-08-17")!;
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("handles month boundaries (01 Jan → 31 Dec previous year UTC)", () => {
    const { start } = bdtDayBoundariesUtc("2026-01-01")!;
    expect(start.toISOString()).toBe("2025-12-31T18:00:00.000Z");
  });

  it("accepts leap-day dates", () => {
    expect(bdtDayBoundariesUtc("2024-02-29")).not.toBeNull();
  });

  it("rejects malformed and overflow dates", () => {
    expect(bdtDayBoundariesUtc("")).toBeNull();
    expect(bdtDayBoundariesUtc("2026-8-17")).toBeNull();
    expect(bdtDayBoundariesUtc("2026/08/17")).toBeNull();
    expect(bdtDayBoundariesUtc("2026-13-01")).toBeNull();
    expect(bdtDayBoundariesUtc("2026-02-30")).toBeNull(); // Feb 30 normalizes — rejected
    expect(bdtDayBoundariesUtc("2026-02-29")).toBeNull(); // 2026 not a leap year
  });
});

describe("Dhaka midnight helpers", () => {
  it("prev and next midnight differ by exactly 24h", () => {
    const prev = prevBdtMidnightUtc();
    const next = nextBdtMidnightUtc();
    expect(next.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
