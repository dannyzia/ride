/**
 * P1-21 (gap ledger): GET /api/driver/performance — §7.19 chart series.
 * The Dhaka-day bucketing (L: UTC storage, Dhaka conversion at bucketing) is
 * the risky part — asserted with a frozen clock:
 *  - week: rolling 7 Dhaka days, empty days at 0, ratings averaged per day
 *  - month: calendar month in five buckets W1–W5 (days 1-7/8-14/15-21/22-28/29-31)
 *  - invalid period → 400 invalid_period
 *  - cancellation rate divides by assigned (completed+cancelled), not all rides
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { GET } from "@/app/api/driver/performance+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

function request(period?: string): Request {
  const url = period ? `http://localhost/test?period=${period}` : "http://localhost/test";
  return { json: undefined, url } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

const DRIVER: Row = { id: DRIVER_ID, acceptance_rate: "92.50", rating: "4.70" };

const COUNTS = [
  [{ cnt: 10 }], // trips this week
  [{ cnt: 40 }], // trips this month
  [{ cnt: 4 }], // cancelled (all time)
  [{ cnt: 50 }], // assigned = completed + cancelled
  [{ total_minutes: "600" }], // online minutes this week → 10.0 h
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-05T12:00:00Z")); // Sat 18:00 Dhaka
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("GET /api/driver/performance", () => {
  test("400 invalid_period for a bad query param", async () => {
    mockFor({});
    const res = await GET(request("fortnight"));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_period");
  });

  test("week: rolling 7 Dhaka-day series, empty days at 0, ratings averaged", async () => {
    mockFor({
      series: [
        // Sep 4 (Fri) Dhaka: two rides — fares sum, ratings average
        { completed_at: new Date("2026-09-04T06:00:00Z"), driver_fare_bdt: 12_000, driver_rating: 5 },
        { completed_at: new Date("2026-09-04T09:00:00Z"), driver_fare_bdt: 8_000, driver_rating: 4 },
        // Sep 2 (Wed): one ride, unrated
        { completed_at: new Date("2026-09-02T07:00:00Z"), driver_fare_bdt: 9_000, driver_rating: null },
      ],
    });

    const res = await GET(request("week"));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.trips_this_week).toBe(10);
    expect(body.online_hours).toBe(10);
    expect(body.cancellation_rate).toBe(8); // 4/50
    expect(body.acceptance_rate).toBe(92.5);

    const earnings = body.earnings_series as Array<{ label: string; value_bdt: number }>;
    expect(earnings).toHaveLength(7); // rolling week, empty days included
    const friday = earnings.find((e) => e.label === "Fri")!;
    expect(friday.value_bdt).toBe(20_000);
    const wednesday = earnings.find((e) => e.label === "Wed")!;
    expect(wednesday.value_bdt).toBe(9_000);
    const totalWeekEarnings = earnings.reduce((s, e) => s + e.value_bdt, 0);
    expect(totalWeekEarnings).toBe(29_000);

    const ratingSeries = body.rating_series as number[];
    expect(ratingSeries).toEqual([4.5]); // only Sep 4 had ratings: (5+4)/2
  });

  test("month: five W1–W5 buckets by Dhaka day-of-month", async () => {
    mockFor({
      series: [
        { completed_at: new Date("2026-09-03T06:00:00Z"), driver_fare_bdt: 5_000, driver_rating: 4 }, // day 3 → W1
        { completed_at: new Date("2026-09-15T06:00:00Z"), driver_fare_bdt: 7_000, driver_rating: 5 }, // day 15 → W3
      ],
    });

    const res = await GET(request("month"));
    const body = await getJson(res);
    const earnings = body.earnings_series as Array<{ label: string; value_bdt: number }>;
    expect(earnings.map((e) => e.label)).toEqual(["W1", "W2", "W3", "W4", "W5"]);
    expect(earnings[0].value_bdt).toBe(5_000);
    expect(earnings[2].value_bdt).toBe(7_000);
    expect(earnings[1].value_bdt).toBe(0);
    expect(body.rating_labels).toEqual(["W1", "W3"]);
  });

  test("404 driver_not_found", async () => {
    mockFor({});
    (db.select as jest.Mock).mockImplementation(() => {
      const chain: any = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        limit: async () => [],
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve([]).then(res, rej),
      };
      return chain;
    });
    const res = await GET(request("week"));
    expect(res.status).toBe(404);
  });
});

function mockFor(opts: { series?: Row[] }): void {
  let call = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    call++;
    // call 1 users · 2 drivers · 3-6 the four counts · 7 online minutes · 8 series
    const rows =
      call === 1
        ? [{ id: USER_ID }]
        : call === 2
          ? [DRIVER]
          : call <= 6
            ? COUNTS[call - 3]
            : call === 7
              ? COUNTS[4]
              : opts.series ?? [];
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}
