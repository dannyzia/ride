import { bdtDayBoundariesUtc, prevBdtMidnightUtc, nextBdtMidnightUtc, relativeTime } from "@/lib/time";

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

describe("relativeTime", () => {
  const NOW = new Date("2026-08-17T12:00:00Z");

  it("renders \"Just now\" for recent and future timestamps", () => {
    expect(relativeTime(new Date("2026-08-17T11:59:30Z"), NOW)).toBe("Just now");
    // Future timestamps clamp to "Just now" rather than "negative ago".
    expect(relativeTime(new Date("2026-08-17T12:05:00Z"), NOW)).toBe("Just now");
  });

  it("renders minutes", () => {
    expect(relativeTime(new Date("2026-08-17T11:58:00Z"), NOW)).toBe("2 min ago");
    expect(relativeTime(new Date("2026-08-17T11:01:00Z"), NOW)).toBe("59 min ago");
  });

  it("renders hours with singular/plural and flooring", () => {
    expect(relativeTime(new Date("2026-08-17T11:00:00Z"), NOW)).toBe("1 hour ago");
    // 90 minutes floors to 1 hour, not 1.5.
    expect(relativeTime(new Date("2026-08-17T10:30:00Z"), NOW)).toBe("1 hour ago");
    expect(relativeTime(new Date("2026-08-17T09:00:00Z"), NOW)).toBe("3 hours ago");
  });
});
