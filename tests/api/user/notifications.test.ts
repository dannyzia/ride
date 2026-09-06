/**
 * Notification inbox — pagination + 30-day retention semantics
 * (lib/notifications/server.ts, shared by rider and driver endpoints).
 *
 * Invariants:
 *  - listNotifications: cursor pagination (limit+1 lookahead → next_cursor
 *    from the last row's created_at), soft-deleted rows excluded,
 *    unread_count independent of the cursor.
 *  - Retention edge contract: created 31d ago + read 1d ago → sweep-eligible;
 *    created 29d ago + read 1d ago → kept. Unread rows are NEVER swept.
 *  - sweepExpiredNotifications stamps deleted_at in batch; the WHERE is
 *    read_at IS NOT NULL AND created_at < cutoff AND deleted_at IS NULL.
 *  - The rider GET endpoint is role-gated (driver role → 403).
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  requireAnyRole: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { db } from "@/src/db";
import { requireAnyRole } from "@/lib/auth";
import {
  listNotifications,
  isPastRetention,
  sweepExpiredNotifications,
  timeAgo,
} from "@/lib/notifications/server";
import { GET } from "@/app/api/rider/notifications+api";

const USER_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-09-06T04:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 3_600_000);
}

type Row = Record<string, unknown>;

function makeChain(rows: Row[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.then = (
    res?: (v: unknown) => unknown,
    rej?: (e: unknown) => unknown,
  ) => Promise.resolve(rows).then(res, rej);
  return chain;
}

function inboxRow(i: number, createdAt: Date, readAt: Date | null = null): Row {
  return {
    id: `notif-${String(i).padStart(3, "0")}`,
    type: "system",
    title: `N${i}`,
    body: null,
    data: null,
    read_at: readAt,
    created_at: createdAt,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("timeAgo", () => {
  test("compact s/m/h/d format", () => {
    expect(timeAgo(new Date(NOW.getTime() - 30_000), NOW)).toBe("30s");
    expect(timeAgo(new Date(NOW.getTime() - 2 * 60_000), NOW)).toBe("2m");
    expect(timeAgo(new Date(NOW.getTime() - 3 * 3_600_000), NOW)).toBe("3h");
    expect(timeAgo(new Date(NOW.getTime() - 3 * 24 * 3_600_000), NOW)).toBe("3d");
  });
});

describe("isPastRetention — 30-day soft delete edge cases", () => {
  test("created 31 days ago, read 1 day ago → sweep-eligible", () => {
    const row = {
      created_at: new Date(NOW.getTime() - 31 * 24 * 3_600_000),
      read_at: new Date(NOW.getTime() - 1 * 24 * 3_600_000),
    };
    expect(isPastRetention(row, NOW)).toBe(true);
  });

  test("created 29 days ago, read 1 day ago → kept", () => {
    const row = {
      created_at: new Date(NOW.getTime() - 29 * 24 * 3_600_000),
      read_at: new Date(NOW.getTime() - 1 * 24 * 3_600_000),
    };
    expect(isPastRetention(row, NOW)).toBe(false);
  });

  test("unread rows are never eligible, however old", () => {
    const row = {
      created_at: new Date(NOW.getTime() - 400 * 24 * 3_600_000),
      read_at: null,
    };
    expect(isPastRetention(row, NOW)).toBe(false);
  });
});

describe("sweepExpiredNotifications", () => {
  test("stamps deleted_at on read rows past the cutoff and reports the count", async () => {
    let setObj: Row | undefined;
    let whereSql: SQL | undefined;
    (db.update as jest.Mock).mockImplementation(() => ({
      set: jest.fn((s: Row) => {
        setObj = s;
        return {
          where: jest.fn((w: SQL) => {
            whereSql = w;
            return {
              returning: jest.fn(async () => [
                { id: "a" },
                { id: "b" },
              ]),
            };
          }),
        };
      }),
    }));

    const deleted = await sweepExpiredNotifications(NOW);
    expect(deleted).toBe(2);
    expect(setObj).toHaveProperty("deleted_at");

    const sqlText = new PgDialect().sqlToQuery(whereSql as SQL).sql;
    expect(sqlText).toContain("deleted_at");
    expect(sqlText).toContain("read_at");
    expect(sqlText).toContain("created_at");
  });
});

describe("listNotifications", () => {
  test("returns next_cursor when more rows exist beyond the page", async () => {
    const rows: Row[] = [];
    for (let i = 0; i < 21; i++) rows.push(inboxRow(i, daysAgo(i)));

    let call = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      call += 1;
      return makeChain(call === 1 ? rows : [{ unread: 3 }]);
    });

    const page = await listNotifications(USER_ID, { limit: 20, now: NOW });
    expect(page.notifications).toHaveLength(20);
    expect(page.unread_count).toBe(3);
    // Cursor = created_at of the LAST row on the page (20th).
    expect(page.next_cursor).toBe((page.notifications[19].created_at as Date).toISOString());
    expect(page.notifications[0].time_ago).toBe("0s");
  });

  test("returns null cursor on the last page and maps time_ago", async () => {
    const rows = [inboxRow(0, daysAgo(2)), inboxRow(1, daysAgo(3))];
    let call = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      call += 1;
      return makeChain(call === 1 ? rows : [{ unread: 0 }]);
    });

    const page = await listNotifications(USER_ID, { limit: 20, now: NOW });
    expect(page.notifications).toHaveLength(2);
    expect(page.next_cursor).toBeNull();
    expect(page.notifications[0].time_ago).toBe("2d");
  });

  test("rejects a malformed cursor with a 400-tagged error", async () => {
    await expect(
      listNotifications(USER_ID, { before: "not-a-date" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("GET /api/rider/notifications", () => {
  function request(url = "http://localhost/api/rider/notifications"): Request {
    return { url } as unknown as Request;
  }

  test("driver role → 403", async () => {
    (requireAnyRole as jest.Mock).mockImplementation(
      () => async () => {
        throw { status: 403 };
      },
    );
    const res = await GET(request());
    expect(res.status).toBe(403);
  });

  test("rider role → paginated page payload", async () => {
    (requireAnyRole as jest.Mock).mockImplementation(
      () => async () => ({ supabaseUser: { id: "sb-1" }, dbUser: { id: USER_ID, role: "rider" } }),
    );
    let call = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      call += 1;
      return makeChain(
        call === 1
          ? [inboxRow(0, daysAgo(1), new Date(NOW.getTime() - 3_600_000))]
          : [{ unread: 1 }],
      );
    });

    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.unread_count).toBe(1);
    expect((body.notifications as Row[])[0].id).toBe("notif-000");
  });
});
