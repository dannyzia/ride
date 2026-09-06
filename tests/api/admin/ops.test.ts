/**
 * P2-24 (gap ledger): admin ops routes — dispatch-toggle, fraud-flags,
 * broadcast, tax config.
 * Invariants:
 *  - dispatch-toggle: hot pause/resume via system_config WITHOUT restart
 *    (AGENTS.md platform_config rule); first-ever toggle INSERTs the row,
 *    later ones UPDATE it; safety.write on both verbs
 *  - fraud-flags: flag_type/status enum-validated at the boundary (400 on
 *    garbage, not silent empty lists); review.write guard
 *  - broadcast: safety.write + a 5-minute rate limiter against push spam;
 *    Expo push failures degrade to counts, never 500s
 *  - tax config: rate_percent round-trips as string (numeric(5,2) col — the
 *    ONE non-money-rate exception in the schema)
 */
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import { db } from "@/src/db";
import { requireAdminPermission } from "@/lib/adminRbac";
import { systemConfig } from "@/src/db/schema";
import * as toggleRoute from "@/app/api/admin/dispatch-toggle+api";
import * as fraudRoute from "@/app/api/admin/fraud-flags+api";
import * as broadcastRoute from "@/app/api/admin/broadcast+api";
import * as taxRoute from "@/app/api/admin/tax/config+api";

/**
 * broadcast keeps a module-level 5-minute rate limiter; isolateModules gives
 * each test a fresh module (fresh lastBroadcastAt) so tests are order-proof.
 */
function freshBroadcast(): typeof import("@/app/api/admin/broadcast+api") {
  let mod!: typeof import("@/app/api/admin/broadcast+api");
  jest.isolateModules(() => {
    mod = require("@/app/api/admin/broadcast+api");
  });
  return mod;
}

type Row = Record<string, unknown>;

function jsonRequest(body?: unknown, url = "http://localhost/test"): Request {
  return {
    json: body === undefined ? undefined : async () => body,
    url,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

const allowedPerms = new Set<string>(["safety.write", "review.write", "finance.write"]);

beforeEach(() => {
  jest.clearAllMocks();
  (requireAdminPermission as jest.Mock).mockImplementation(
    (perm: string) =>
      allowedPerms.has(perm)
        ? jest.fn(async () => ({ supabaseUser: { id: "admin-supabase" }, dbUser: { id: "admin-1", role: "admin" } }))
        : jest.fn(async () => {
            throw { status: 401 };
          }),
  );
});

describe("admin dispatch-toggle", () => {
  test("GET reports paused=true when the config row says so", async () => {
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => [{ key: "dispatch_paused", value: "true" }]),
        })),
      })),
    }));
    const res = await toggleRoute.GET(jsonRequest());
    expect((await getJson(res)).dispatch_paused).toBe(true);
  });

  test("GET defaults to false when the config row does not exist yet", async () => {
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => []),
        })),
      })),
    }));
    const res = await toggleRoute.GET(jsonRequest());
    expect((await getJson(res)).dispatch_paused).toBe(false);
  });

  test("POST pause updates the existing row (no restart required)", async () => {
    const updates: Row[] = [];
    let selectCall = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      selectCall++;
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: jest.fn(async () => (selectCall === 1 ? [{ id: "row-1" }] : [])),
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve([]).then(res, rej),
      };
      return chain;
    });
    (db.update as jest.Mock).mockImplementation((_table: unknown) => ({
      set: jest.fn((setObj: Row) => {
        updates.push(setObj);
        return { where: jest.fn(async () => []) };
      }),
    }));
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: jest.fn(async () => []),
    }));

    selectCall = 0;
    const res = await toggleRoute.POST(jsonRequest({ paused: true }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ dispatch_paused: true });
    expect(updates[0].value).toBe("true");
  });

  test("POST on a fresh install INSERTs the config row instead of updating", async () => {
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => []),
        })),
      })),
    }));
    const inserted: Row[] = [];
    (db.insert as jest.Mock).mockImplementation((_table: unknown) => ({
      values: jest.fn((v: Row) => {
        inserted.push(v);
        return Promise.resolve([]);
      }),
    }));
    (db.update as jest.Mock).mockImplementation(() => ({
      set: jest.fn(() => ({ where: jest.fn(async () => []) })),
    }));

    const res = await toggleRoute.POST(jsonRequest({ paused: false }));
    expect(res.status).toBe(200);
    expect(inserted).toEqual([{ key: "dispatch_paused", value: "false" }]);
    expect(systemConfig).toBeDefined();
  });
});

describe("admin fraud-flags", () => {
  test("401 when review.write is denied", async () => {
    allowedPerms.clear();
    const res = await fraudRoute.GET(jsonRequest());
    expect(res.status).toBe(401);
    allowedPerms.add("review.write");
  });

  test("400 validation_error for a garbage flag_type filter", async () => {
    const res = await fraudRoute.GET(jsonRequest(undefined, "http://localhost/test?flag_type=vibes"));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("400 validation_error for a garbage status filter", async () => {
    const res = await fraudRoute.GET(jsonRequest(undefined, "http://localhost/test?status=pending"));
    expect(res.status).toBe(400);
  });

  test("valid filters list flags with a total count", async () => {
    let call = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      call++;
      const rows = call === 1 ? [{ total: 3 }] : [{ id: "ff-1", flag_type: "dawdle" }];
      const chain: any = {
        from: () => chain,
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => ({
          offset: async () => rows,
          then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
            Promise.resolve(rows).then(res, rej),
        }),
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve(rows).then(res, rej),
      };
      return chain;
    });

    const res = await fraudRoute.GET(jsonRequest(undefined, "http://localhost/test?flag_type=dawdle&status=open"));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.total).toBe(3);
    expect(body.fraud_flags).toEqual([{ id: "ff-1", flag_type: "dawdle" }]);
  });
});

describe("admin broadcast", () => {
  function mockDevices(rows: Row[]): void {
    let call = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      call++;
      const chain: any = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve(call === 1 ? rows : []).then(res, rej),
      };
      return chain;
    });
  }

  test("401 when safety.write is denied", async () => {
    allowedPerms.clear();
    const res = await freshBroadcast().POST(jsonRequest({ target: "all", title: "t", message: "m" }));
    expect(res.status).toBe(401);
    allowedPerms.add("safety.write");
  });

  test("400 validation_error for an empty title", async () => {
    const res = await freshBroadcast().POST(jsonRequest({ target: "all", title: "", message: "m" }));
    expect(res.status).toBe(400);
  });

  test("sends one Expo push batch for all target devices", async () => {
    mockDevices([{ push_token: "ExpoToken1" }, { push_token: "ExpoToken2" }]);
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({ data: [{ status: "ok" }, { status: "error" }] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await freshBroadcast().POST(jsonRequest({
      target: "all",
      title: "Maintenance",
      message: "Tonight 2am",
    }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true, sent: 1, failed: 1, total: 2 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect(JSON.parse(init.body).to).toEqual(["ExpoToken1", "ExpoToken2"]);
  });

  test("rate limiter: a second broadcast within 5 minutes is rejected", async () => {
    mockDevices([]);
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ data: [] }),
    }) as unknown as typeof fetch;
    const route = freshBroadcast();
    const first = await route.POST(jsonRequest({ target: "all", title: "first", message: "m" }));
    expect(first.status).toBe(200);
    const second = await route.POST(jsonRequest({ target: "all", title: "second", message: "m" }));
    expect(second.status).toBe(429);
  });
});

describe("admin tax config", () => {
  test("401 when finance.write is denied", async () => {
    allowedPerms.clear();
    const res = await taxRoute.GET(jsonRequest());
    expect(res.status).toBe(401);
    allowedPerms.add("finance.write");
  });

  test("GET lists tax rates", async () => {
    const rows = [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", rate_percent: "5.00" }];
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(async () => rows),
    }));
    const res = await taxRoute.GET(jsonRequest());
    expect((await getJson(res)).rates).toEqual(rows);
  });

  test("POST stringifies rate_percent for the numeric(5,2) column", async () => {
    const updates: Row[] = [];
    (db.update as jest.Mock).mockImplementation((_table: unknown) => ({
      set: jest.fn((setObj: Row) => {
        updates.push(setObj);
        return { where: jest.fn(async () => []) };
      }),
    }));

    const res = await taxRoute.POST(jsonRequest({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", rate_percent: "7.50", is_active: true }));
    if (res.status !== 200) process.stdout.write(`TAX400: ${JSON.stringify(await (res.clone() as Response).json())}`);
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true });
    expect(updates[0]).toMatchObject({ rate_percent: "7.50", is_active: true });
    expect(updates[0].updated_at).toBeInstanceOf(Date);
  });
});
