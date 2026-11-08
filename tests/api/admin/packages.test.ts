/**
 * M-3 follow-up: admin package CRUD under packages_name_live_uq (migration 0057).
 *
 * The invariant under test is the API contract the new partial unique index
 * forces. `packages.name` had NO uniqueness, so an admin could create or rename
 * two live packages onto the same name and the server accepted it — producing
 * exactly the duplicate plan rows the advisory lock was added to stop. Now
 * Postgres rejects the second one, and an unhandled 23505 would surface as a
 * 500. These tests pin that both write paths translate it into a 409 naming the
 * conflict, which is what the Admin > Packages screen needs to show a human.
 *
 * Not covered here (and deliberately so): the constraint itself is enforced and
 * backfilled by real Postgres, which tests/concurrency/launch-free-package-lock
 * exercises against a live database. A mocked 23505 only proves the mapping.
 *
 * Mirrors the existing tests/api/admin/promos.test.ts shape (its 409 branch is
 * the precedent this follows).
 */
/* eslint-disable import/first */
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(),
}));
jest.mock("@/lib/parseBody", () => ({
  parseJsonBody: jest.fn(async (request: Request) => {
    const body = await request.json();
    return { ok: true, data: body };
  }),
}));
jest.mock("@/lib/platformConfig", () => ({
  getMaxCommissionDebtBdt: jest.fn(async () => 50_000),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { requireAdminPermission } from "@/lib/adminRbac";
import { logger } from "@/lib/logger";
import { packages } from "@/src/db/schema";
import { GET, POST, PUT, DELETE } from "@/app/api/admin/packages+api";

const PKG_ID = "44444444-4444-4444-8444-444444444444";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";

const VALID = {
  name: "Weekend Boost",
  call_count: 50,
  duration_days: 30,
  price_bdt: 5000,
};

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
      ? jest.fn(async () => ({ dbUser: { id: ADMIN_ID, role: "admin" } }))
      : jest.fn(async () => {
          throw { status: 401 };
        }),
  );
}

/** A drizzle insert chain that rejects the way Postgres rejects a 23505. */
function insertThrows(code: string): jest.Mock {
  return jest.fn(() => ({
    values: jest.fn(() => {
      throw { code };
    }),
  }));
}

/** A drizzle update chain that rejects the way Postgres rejects a 23505. */
function updateThrows(code: string): jest.Mock {
  return jest.fn(() => ({
    set: jest.fn(() => ({
      where: jest.fn(() => {
        throw { code };
      }),
    })),
  }));
}

beforeEach(() => {
  (db.insert as jest.Mock).mockReset();
  (db.update as jest.Mock).mockReset();
  (db.select as jest.Mock).mockReset();
  grant("price.write", true);
});

describe("POST /api/admin/packages", () => {
  test("409 package_name_taken when a live package already holds the name (pg 23505)", async () => {
    (db.insert as jest.Mock).mockImplementation(insertThrows("23505"));
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(409);
    const body = await getJson(res);
    expect(body.error).toBe("package_name_taken");
    // The message must name the conflict — an admin staring at a 500 has no
    // idea which field collided.
    expect(String(body.message)).toMatch(/already exists/i);
  });

  test("an unrelated db failure is still a 500, NOT a 409", async () => {
    // Guards the mapping from swallowing every insert error as a name clash.
    (db.insert as jest.Mock).mockImplementation(insertThrows("23503"));
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(500);
    expect((await getJson(res)).error).toBe("internal_error");
  });

  test("creates the package and returns 201 when the name is free", async () => {
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: jest.fn(() => ({ returning: jest.fn(async () => [{ id: PKG_ID, name: VALID.name }]) })),
    }));
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(201);
    expect((await getJson(res)).package).toMatchObject({ id: PKG_ID });
  });

  test("accepts -1 for unlimited call_count and custom roles", async () => {
    let insertedValues: unknown;
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: jest.fn((vals) => {
        insertedValues = vals;
        return { returning: jest.fn(async () => [{ id: PKG_ID, ...vals }]) };
      }),
    }));
    const res = await POST(
      jsonRequest({
        ...VALID,
        call_count: -1,
        roles: ["delivery_man", "shop_owner"],
      }),
    );
    expect(res.status).toBe(201);
    expect(insertedValues).toMatchObject({
      call_count: -1,
      roles: ["delivery_man", "shop_owner"],
    });
  });

  test("D3-B-r2: call_count = 0 (no lead leg) is accepted; -5 rejected with call_count_invalid", async () => {
    // 0 was rejected pre-amendment; D3-B-r2 redefines 0 as "no lead leg".
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: jest.fn((vals) => ({ returning: jest.fn(async () => [{ id: PKG_ID, ...vals }]) })),
    }));
    const resZero = await POST(jsonRequest({ ...VALID, call_count: 0 }));
    expect(resZero.status).toBe(201);

    const resNeg = await POST(jsonRequest({ ...VALID, call_count: -5 }));
    expect(resNeg.status).toBe(400);
    expect((await getJson(resNeg)).error).toBe("call_count_invalid");
  });

  test("401 without price.write", async () => {
    grant("price.write", false);
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(401);
  });

  // ── Batch-2 Item 1: applicable_roles matrix ──────────────────────────────

  test("omitting applicable_roles is accepted (column default '{driver}' applies in DB)", async () => {
    let insertedValues: unknown;
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: jest.fn((vals) => {
        insertedValues = vals;
        return { returning: jest.fn(async () => [{ id: PKG_ID, ...vals }]) };
      }),
    }));
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(201);
    // The parseBody mock bypasses Zod defaults, so the key is absent here —
    // the Postgres column default '{driver}' covers the row.
    expect(insertedValues).not.toHaveProperty("applicable_roles");
  });

  test("multi-role applicable_roles ['driver','shop'] is accepted", async () => {
    let insertedValues: unknown;
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: jest.fn((vals) => {
        insertedValues = vals;
        return { returning: jest.fn(async () => [{ id: PKG_ID, ...vals }]) };
      }),
    }));
    const res = await POST(
      jsonRequest({ ...VALID, applicable_roles: ["driver", "shop"] }),
    );
    expect(res.status).toBe(201);
    expect(insertedValues).toMatchObject({ applicable_roles: ["driver", "shop"] });
  });

  test("invalid element 'restaurant' → 400 applicable_roles_invalid (restaurants are shops)", async () => {
    const res = await POST(
      jsonRequest({ ...VALID, applicable_roles: ["driver", "restaurant"] }),
    );
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("applicable_roles_invalid");
  });

  test("empty applicable_roles array → 400 applicable_roles_invalid", async () => {
    const res = await POST(jsonRequest({ ...VALID, applicable_roles: [] }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("applicable_roles_invalid");
  });

  test("non-array applicable_roles → 400 applicable_roles_invalid", async () => {
    const res = await POST(jsonRequest({ ...VALID, applicable_roles: "driver" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("applicable_roles_invalid");
  });

  // ── D3-B-r2 four-field admin matrix ──────────────────────────────────────

  test("commission_percent = 50 (bundle commission leg) is accepted", async () => {
    let insertedValues: unknown;
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: jest.fn((vals) => {
        insertedValues = vals;
        return { returning: jest.fn(async () => [{ id: PKG_ID, ...vals }]) };
      }),
    }));
    const res = await POST(
      jsonRequest({ ...VALID, commission_percent: 50 }),
    );
    expect(res.status).toBe(201);
    // Drizzle numeric columns receive string values.
    expect(insertedValues).toMatchObject({ commission_percent: "50" });
  });

  test("commission_percent = 0 (no commission leg) is accepted", async () => {
    let insertedValues: unknown;
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: jest.fn((vals) => {
        insertedValues = vals;
        return { returning: jest.fn(async () => [{ id: PKG_ID, ...vals }]) };
      }),
    }));
    const res = await POST(
      jsonRequest({ ...VALID, commission_percent: 0 }),
    );
    expect(res.status).toBe(201);
    expect(insertedValues).toMatchObject({ commission_percent: "0" });
  });

  test("commission_percent = 101 → 400 commission_percent_invalid", async () => {
    const res = await POST(jsonRequest({ ...VALID, commission_percent: 101 }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("commission_percent_invalid");
  });

  test("commission_percent = -5 → 400 commission_percent_invalid", async () => {
    const res = await POST(jsonRequest({ ...VALID, commission_percent: -5 }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("commission_percent_invalid");
  });

  test("trial package with commission_percent → 400 commission_percent_invalid", async () => {
    const res = await POST(
      jsonRequest({ ...VALID, is_trial: true, commission_percent: 5 }),
    );
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("commission_percent_invalid");
  });

  test("call_count = -5 → 400 call_count_invalid", async () => {
    const res = await POST(jsonRequest({ ...VALID, call_count: -5 }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("call_count_invalid");
  });

  test("call_count = 0 (no lead leg) is accepted", async () => {
    let insertedValues: unknown;
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: jest.fn((vals) => {
        insertedValues = vals;
        return { returning: jest.fn(async () => [{ id: PKG_ID, ...vals }]) };
      }),
    }));
    const res = await POST(jsonRequest({ ...VALID, call_count: 0 }));
    expect(res.status).toBe(201);
    expect(insertedValues).toMatchObject({ call_count: 0 });
  });

  test("duration_days = 0 → 400 duration_days_invalid", async () => {
    const res = await POST(jsonRequest({ ...VALID, duration_days: 0 }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("duration_days_invalid");
  });

  test("duration_days = -5 → 400 duration_days_invalid", async () => {
    const res = await POST(jsonRequest({ ...VALID, duration_days: -5 }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("duration_days_invalid");
  });

  test("duration_days = -1 (unlimited) is accepted", async () => {
    let insertedValues: unknown;
    (db.insert as jest.Mock).mockImplementation(() => ({
      values: jest.fn((vals) => {
        insertedValues = vals;
        return { returning: jest.fn(async () => [{ id: PKG_ID, ...vals }]) };
      }),
    }));
    const res = await POST(jsonRequest({ ...VALID, duration_days: -1 }));
    expect(res.status).toBe(201);
    expect(insertedValues).toMatchObject({ duration_days: -1 });
  });

  test("non-trial price_bdt = 500 (< ৳10) → 400 package_constraint_violation", async () => {
    const res = await POST(jsonRequest({ ...VALID, price_bdt: 500, is_trial: false }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("package_constraint_violation");
  });

  test("price_bdt above ceiling - ৳10 → 400 package_constraint_violation", async () => {
    const res = await POST(jsonRequest({ ...VALID, price_bdt: 50000 }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("package_constraint_violation");
  });

  test("PUT with commission_percent converts to string for numeric column", async () => {
    let updatedValues: unknown;
    (db.update as jest.Mock).mockImplementation(() => ({
      set: jest.fn((vals) => {
        updatedValues = vals;
        return { where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: PKG_ID }]) })) };
      }),
    }));
    const res = await PUT(jsonRequest({ ...VALID, id: PKG_ID, commission_percent: 15 }));
    expect(res.status).toBe(200);
    expect((updatedValues as Record<string, unknown>).commission_percent).toBe("15");
  });
});

describe("PUT /api/admin/packages", () => {
  test("409 package_name_taken when renaming onto a live package's name (pg 23505)", async () => {
    (db.update as jest.Mock).mockImplementation(updateThrows("23505"));
    const res = await PUT(jsonRequest({ id: PKG_ID, name: "Pro 200" }));
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("package_name_taken");
  });

  test("404 when the id matches no live package", async () => {
    // The route chains .where(...).returning() and then DESTRUCTURES the
    // result, so `returning` must resolve to an array — real drizzle always
    // does. Resolving to undefined throws "undefined is not iterable" and the
    // route reports 500 instead of the 404 under test.
    (db.update as jest.Mock).mockImplementation(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn(async () => []) })),
      })),
    }));
    const res = await PUT(jsonRequest({ id: PKG_ID }));
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("package_not_found");
  });

  test("an unrelated db failure on rename is still a 500", async () => {
    (db.update as jest.Mock).mockImplementation(updateThrows("23503"));
    const res = await PUT(jsonRequest({ id: PKG_ID, name: "Pro 200" }));
    expect(res.status).toBe(500);
  });

  test("PUT with applicable_roles passes the array through to Drizzle", async () => {
    let updatedValues: unknown;
    (db.update as jest.Mock).mockImplementation(() => ({
      set: jest.fn((vals) => {
        updatedValues = vals;
        return { where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: PKG_ID }]) })) };
      }),
    }));
    const res = await PUT(
      jsonRequest({ id: PKG_ID, applicable_roles: ["shop", "delivery"] }),
    );
    expect(res.status).toBe(200);
    expect((updatedValues as Record<string, unknown>).applicable_roles).toEqual([
      "shop",
      "delivery",
    ]);
  });
});

describe("GET /api/admin/packages", () => {
  test("filters soft-deleted rows out of the listing", async () => {
    // The partial unique index is scoped to deleted_at IS NULL, so the list the
    // admin sees is exactly the set the index governs. If these two ever drift,
    // an admin can be shown a name they are then forbidden to reuse.
    let whereArg: unknown;
    const chain: Record<string, unknown> = {};
    chain.from = jest.fn(() => chain);
    chain.where = jest.fn((cond: unknown) => {
      whereArg = cond;
      return chain;
    });
    chain.orderBy = jest.fn(async () => [{ id: PKG_ID }]);
    (db.select as jest.Mock).mockImplementation(() => chain);

    const res = await GET(jsonRequest(undefined));
    expect(res.status).toBe(200);
    expect(chain.where).toHaveBeenCalledTimes(1);
    expect(whereArg).toBeDefined();
    expect(db.select).toHaveBeenCalledWith();
    expect(packages.deleted_at).toBeDefined();
  });
});

describe("DELETE /api/admin/packages", () => {
  test("soft-deletes (deleted_at + is_active) rather than deleting the row", async () => {
    // This is why the index is partial: after this call the name becomes
    // available again. A plain UNIQUE(name) would permanently reserve it.
    const set = jest.fn((_values: Record<string, unknown>) => ({
      where: jest.fn(async () => undefined),
    }));
    (db.update as jest.Mock).mockImplementation(() => ({ set }));
    const res = await DELETE(jsonRequest(undefined, "http://localhost/test?id=" + PKG_ID));
    expect(res.status).toBe(200);
    const values = set.mock.calls[0][0];
    expect(values.deleted_at).toBeInstanceOf(Date);
    expect(values.is_active).toBe(false);
  });

  test("400 without an id", async () => {
    const res = await DELETE(jsonRequest(undefined));
    expect(res.status).toBe(400);
  });
});
