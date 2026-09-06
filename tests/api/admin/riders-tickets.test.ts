/**
 * P2-24 (gap ledger): admin rider moderation + support tickets.
 * Invariants:
 *  - rider suspend scopes the update to id AND role='rider' (SQL-level — an
 *    admin can never suspend a driver or admin through this route)
 *  - rider refund: bounded (৳50,000 = topup cap ceiling, U-3), credits the
 *    wallet and books the ledger row inside one tx; the U-3 journal entry is
 *    non-blocking (a missing journal never undoes the credit)
 *  - tickets: finance.write guard on every action; reply requires an existing
 *    ticket and moves it to in_progress with the admin as author
 */
/* eslint-disable import/first */
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/accounting", () => ({
  recordAdminRefund: jest.fn(),
}));

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { db } from "@/src/db";
import { requireAdminPermission } from "@/lib/adminRbac";
import { recordAdminRefund } from "@/lib/accounting";
import { riderWalletTransactions, supportTickets, ticketReplies, users } from "@/src/db/schema";
import { POST as riderSuspend } from "@/app/api/admin/riders/[id]/suspend+api";
import { POST as riderRefund } from "@/app/api/admin/riders/[id]/refund+api";
import { GET as ticketsGET } from "@/app/api/admin/tickets+api";
import { POST as ticketAssign } from "@/app/api/admin/tickets/[id]/assign+api";
import { POST as ticketReply } from "@/app/api/admin/tickets/[id]/reply+api";

const RIDER_ID = "22222222-2222-4222-8222-222222222222";
const TICKET_ID = "33333333-3333-4333-8333-333333333333";
const ADMIN_ID = "44444444-4444-4444-8444-444444444444";

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

function grant(permission: string, allowed: boolean): void {
  (requireAdminPermission as jest.Mock).mockImplementation((perm: string) =>
    perm === permission && allowed
      ? jest.fn(async () => ({ supabaseUser: { id: "admin-supabase" }, dbUser: { id: ADMIN_ID, role: "admin" } }))
      : jest.fn(async () => {
          throw { status: 401 };
        }),
  );
}

const directUpdates: { table: unknown; set: Row; where?: SQL }[] = [];
const txUpdates: { table: unknown; set: Row; where?: SQL }[] = [];
const txInserts: { table: unknown; values: Row }[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  directUpdates.length = 0;
  txUpdates.length = 0;
  txInserts.length = 0;
  grant("finance.write", true);
  (recordAdminRefund as jest.Mock).mockResolvedValue(undefined);
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => ({
      where: jest.fn((w: SQL) => {
        directUpdates.push({ table, set: setObj, where: w });
        return Promise.resolve([]);
      }),
    })),
  }));
  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn((v: Row) => {
      txInserts.push({ table, values: v });
      return Promise.resolve([]);
    }),
  }));
  const tx = {
    update: jest.fn((table: unknown) => ({
      set: jest.fn((setObj: Row) => ({
        where: jest.fn((w: SQL) => {
          txUpdates.push({ table, set: setObj, where: w });
          return [];
        }),
      })),
    })),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((v: Row) => {
        txInserts.push({ table, values: v });
        return Promise.resolve([]);
      }),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));
});

describe("POST /api/admin/riders/[id]/suspend", () => {
  test("400 invalid_uuid", async () => {
    const res = await riderSuspend(jsonRequest({}), { id: "nope" });
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_uuid");
  });

  test("401 when the safety.write guard rejects", async () => {
    grant("safety.write", false);
    const res = await riderSuspend(jsonRequest({}), { id: RIDER_ID });
    expect(res.status).toBe(401);
  });

  test("update is scoped to the id AND role='rider' (no cross-role suspension)", async () => {
    grant("safety.write", true);
    const res = await riderSuspend(jsonRequest({ reason: "abuse" }), { id: RIDER_ID });
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true });

    expect(directUpdates).toHaveLength(1);
    expect(directUpdates[0].table).toBe(users);
    expect(directUpdates[0].set).toEqual({ account_status: "suspended" });
    const rendered = new PgDialect().sqlToQuery(directUpdates[0].where as SQL);
    expect(rendered.sql).toContain('"users"."id" = $');
    expect(rendered.sql).toContain('"users"."role" = $');
    expect(rendered.params).toContain(RIDER_ID);
    expect(rendered.params).toContain("rider");
  });
});

describe("POST /api/admin/riders/[id]/refund", () => {
  test("400 invalid_uuid", async () => {
    const res = await riderRefund(jsonRequest({ amount_bdt: 100, reason: "oops" }), { id: "x" });
    expect(res.status).toBe(400);
  });

  test("400 validation_error above the ৳50,000 ceiling (U-3)", async () => {
    const res = await riderRefund(jsonRequest({ amount_bdt: 5_000_001, reason: "typo" }), { id: RIDER_ID });
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("400 validation_error for a non-positive amount", async () => {
    const res = await riderRefund(jsonRequest({ amount_bdt: 0, reason: "x" }), { id: RIDER_ID });
    expect(res.status).toBe(400);
  });

  test("success: wallet credit + ledger row in one tx, non-blocking journal entry", async () => {
    const res = await riderRefund(jsonRequest({ amount_bdt: 25_000, reason: "goodwill" }), { id: RIDER_ID });
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true });

    const credit = txUpdates.find((u) => u.table === users);
    expect(credit).toBeDefined();
    const ledger = txInserts.find((i) => i.table === riderWalletTransactions);
    expect(ledger!.values).toMatchObject({
      rider_id: RIDER_ID,
      transaction_type: "adjustment",
      amount_bdt: 25_000,
    });
    expect(recordAdminRefund).toHaveBeenCalledWith({ riderId: RIDER_ID, amountPaisa: 25_000, reason: "goodwill" });
  });

  test("journal failure never undoes the wallet credit (non-blocking U-3)", async () => {
    (recordAdminRefund as jest.Mock).mockRejectedValue(new Error("accounts missing"));
    const res = await riderRefund(jsonRequest({ amount_bdt: 25_000, reason: "goodwill" }), { id: RIDER_ID });
    expect(res.status).toBe(200);
    expect(txInserts.find((i) => i.table === riderWalletTransactions)).toBeDefined();
  });
});

describe("GET /api/admin/tickets", () => {
  test("401 when the finance.write guard rejects", async () => {
    grant("finance.write", false);
    const res = await ticketsGET(jsonRequest(undefined));
    expect(res.status).toBe(401);
  });

  test("returns tickets with user info and the total count", async () => {
    const rows = [{ id: TICKET_ID, subject: "Charged twice", user_name: "Zia" }];
    (db.select as jest.Mock).mockImplementation(() => {
      const chain: any = {
        from: () => chain,
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

    const res = await ticketsGET(jsonRequest(undefined));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.tickets).toEqual(rows);
    expect(body.total).toBe(0); // count select hits the exhausted queue
  });
});

describe("POST /api/admin/tickets/[id]/assign", () => {
  test("400 invalid_uuid", async () => {
    const res = await ticketAssign(jsonRequest({ assigned_to: ADMIN_ID }), { id: "x" });
    expect(res.status).toBe(400);
  });

  test("assigns the ticket to a staff member", async () => {
    const res = await ticketAssign(jsonRequest({ assigned_to: ADMIN_ID }), { id: TICKET_ID });
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true });
    expect(directUpdates[0].table).toBe(supportTickets);
    expect(directUpdates[0].set.assigned_to).toBe(ADMIN_ID);
  });
});

describe("POST /api/admin/tickets/[id]/reply", () => {
  test("400 validation_error for an empty message", async () => {
    const res = await ticketReply(jsonRequest({ message: "" }), { id: TICKET_ID });
    expect(res.status).toBe(400);
  });

  test("404 ticket_not_found", async () => {
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => []),
        })),
      })),
    }));
    const res = await ticketReply(jsonRequest({ message: "on it" }), { id: TICKET_ID });
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("ticket_not_found");
  });

  test("books the reply with the admin as author and moves the ticket to in_progress", async () => {
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => [{ id: TICKET_ID }]),
        })),
      })),
    }));

    const res = await ticketReply(jsonRequest({ message: "refund processed", is_internal: true }), { id: TICKET_ID });
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true });

    const reply = txInserts.find((i) => i.table === ticketReplies);
    expect(reply!.values).toMatchObject({
      ticket_id: TICKET_ID,
      author_id: ADMIN_ID,
      message: "refund processed",
      is_internal: true,
    });
    const ticketUpdate = directUpdates.find((u) => u.table === supportTickets);
    expect(ticketUpdate!.set.status).toBe("in_progress");
  });
});
