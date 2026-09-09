/**
 * F-5.3/F-5.4 (theme5 time audit) — bdtDayOfWeek / bdtHourOfDay helpers.
 *
 * Pins the Asia/Dhaka (fixed UTC+6) day-of-week and hour-of-day semantics the
 * scheduler's weekly jobs (37 heat backtest, 41 decline monitoring) now gate
 * on, replacing host-local getDay()/getHours(). Key boundary: Dhaka local
 * time advances at 18:00 UTC, so 05:59 UTC and 06:00 UTC land on DIFFERENT
 * Dhaka days — the exact trap the host-local version could not avoid.
 */
import { bdtDayOfWeek, bdtHourOfDay } from "@/lib/time";

// 2026-09-06 is a Sunday; 2026-09-12 a Saturday (verified by calendar).
const utc = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h, min));

describe("bdtHourOfDay", () => {
  test("05:59 UTC is 11:59 Dhaka; 06:00 UTC rolls to 12:00 Dhaka the same day", () => {
    expect(bdtHourOfDay(utc(2026, 9, 7, 5, 59))).toBe(11);
    expect(bdtHourOfDay(utc(2026, 9, 7, 6, 0))).toBe(12);
  });

  test("18:00 UTC is Dhaka midnight (00:00) of the NEXT civil day", () => {
    expect(bdtHourOfDay(utc(2026, 9, 7, 17, 59))).toBe(23);
    expect(bdtHourOfDay(utc(2026, 9, 7, 18, 0))).toBe(0);
  });

  test("UTC noon is 18:00 Dhaka", () => {
    expect(bdtHourOfDay(utc(2026, 9, 7, 12))).toBe(18);
  });
});

describe("bdtDayOfWeek", () => {
  test("2026-09-06 is Sunday in Dhaka from 18:00 UTC on Sep 5 through Sep 6", () => {
    // Sep 5 18:00 UTC = Sep 6 00:00 Dhaka → Sunday.
    expect(bdtDayOfWeek(utc(2026, 9, 5, 18, 0))).toBe(0);
    expect(bdtDayOfWeek(utc(2026, 9, 6, 12, 0))).toBe(0);
    // Still Sunday at Sep 6 17:59 UTC (= Sep 6 23:59 Dhaka).
    expect(bdtDayOfWeek(utc(2026, 9, 6, 17, 59))).toBe(0);
    // Sep 6 18:00 UTC = Sep 7 00:00 Dhaka → Monday.
    expect(bdtDayOfWeek(utc(2026, 9, 6, 18, 0))).toBe(1);
  });

  test("2026-09-12 is Saturday in Dhaka (job 41's gate day)", () => {
    // Sep 11 18:00 UTC = Sep 12 00:00 Dhaka → Saturday.
    expect(bdtDayOfWeek(utc(2026, 9, 11, 18, 0))).toBe(6);
    expect(bdtDayOfWeek(utc(2026, 9, 12, 10, 0))).toBe(6);
  });

  test("job 37's window: Sunday 03:00 Dhaka = Saturday 21:00 UTC", () => {
    // Sunday 2026-09-06 03:00 Dhaka = Saturday 2026-09-05 21:00 UTC.
    expect(bdtDayOfWeek(utc(2026, 9, 5, 21, 0))).toBe(0);
    expect(bdtHourOfDay(utc(2026, 9, 5, 21, 0))).toBe(3);
    // One minute earlier: Sunday 02:59 Dhaka — right day, wrong hour, must NOT fire.
    expect(bdtDayOfWeek(utc(2026, 9, 5, 20, 59))).toBe(0);
    expect(bdtHourOfDay(utc(2026, 9, 5, 20, 59))).toBe(2);
  });
});
