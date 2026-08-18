import {
  bdtDayBoundariesUtc,
  prevBdtMidnightUtc,
  nextBdtMidnightUtc,
  relativeTime,
  countdownRemaining,
  dayLabel,
} from "@/lib/time";

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

describe("countdownRemaining", () => {
  it("counts down from the full window at t=0", () => {
    expect(countdownRemaining(0)).toEqual({ minutes: 2, seconds: "00" });
  });

  it("zero-pads seconds to two digits", () => {
    expect(countdownRemaining(61)).toEqual({ minutes: 0, seconds: "59" });
    expect(countdownRemaining(119)).toEqual({ minutes: 0, seconds: "01" });
    expect(countdownRemaining(60)).toEqual({ minutes: 1, seconds: "00" });
  });

  it("returns null once the window has passed", () => {
    expect(countdownRemaining(120)).toBeNull();
    expect(countdownRemaining(121)).toBeNull();
  });

  it("honors a custom window", () => {
    expect(countdownRemaining(30, 60)).toEqual({ minutes: 0, seconds: "30" });
    expect(countdownRemaining(60, 60)).toBeNull();
  });

  it("clamps negative elapsed to zero", () => {
    expect(countdownRemaining(-5)).toEqual({ minutes: 2, seconds: "00" });
  });
});

describe("dayLabel", () => {
  it("renders weekday and date from a YYYY-MM-DD string", () => {
    expect(dayLabel("2026-08-17")).toBe("Mon, 17 Aug");
    expect(dayLabel("2026-08-18")).toBe("Tue, 18 Aug");
    expect(dayLabel("2026-12-31")).toBe("Thu, 31 Dec");
  });

  it("handles month and year boundaries", () => {
    expect(dayLabel("2026-01-01")).toBe("Thu, 1 Jan");
    expect(dayLabel("2026-02-28")).toBe("Sat, 28 Feb");
  });

  it("returns malformed input unchanged instead of NaN garbage", () => {
    expect(dayLabel("abc")).toBe("abc");
    expect(dayLabel("2026-13-01")).toBe("2026-13-01");
    expect(dayLabel("")).toBe("");
  });
});
