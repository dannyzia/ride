/**
 * D3-B-r2 audit closure — enrollment expiry (follow-up point 1).
 *
 * enrollCommission stamps commission_enrollments.expires_at from the
 * package's duration_days: NULL duration (the canonical ৳0 commission
 * package) → NULL expires_at (unlimited); duration >= 1 → now() + days;
 * the -1 unlimited sentinel behaves like NULL (never expires).
 * Pure unit test — tx is a rows-in/values-captured mock; no real DB.
 */
jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    execute: jest.fn(async () => []),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { enrollCommission } from "@/lib/monetizationMode";
import { packages } from "@/src/db/schema";

type Row = Record<string, unknown>;

function makeTx(packageDuration: number | null): {
  tx: { select: jest.Mock; update: jest.Mock; insert: jest.Mock };
  inserts: Row[];
  updates: Row[];
} {
  const inserts: Row[] = [];
  const updates: Row[] = [];
  const tx = {
    select: jest.fn(() => {
      const chain: any = {
        from: (table: unknown) => {
          const rows = table === packages ? [{ duration_days: packageDuration }] : [];
          const c: any = {
            where: () => c,
            limit: async () => rows.slice(0, 1),
            then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
              Promise.resolve(rows).then(resolve, reject),
          };
          return c;
        },
      };
      return chain;
    }),
    update: jest.fn(() => ({
      set: jest.fn((vals: Row) => {
        updates.push(vals);
        return { where: jest.fn(async () => undefined) };
      }),
    })),
    insert: jest.fn(() => ({
      values: jest.fn((vals: Row) => {
        inserts.push(vals);
        return { returning: jest.fn(async () => [{ id: "enr-new" }]) };
      }),
    })),
  };
  return { tx, inserts, updates };
}

const PARAMS = { driverId: "d1", packageId: "pkg-1" };

describe("enrollCommission — D3-B-r2 enrollment expiry", () => {
  test("NULL duration (canonical ৳0 package) → expires_at NULL (unlimited)", async () => {
    const { tx, inserts } = makeTx(null);

    const res = await enrollCommission(tx as never, PARAMS);

    expect(res.enrollmentId).toBe("enr-new");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].expires_at).toBeNull();
    expect(inserts[0]).toMatchObject({
      driver_id: "d1",
      package_id: "pkg-1",
      status: "active",
    });
  });

  test("duration_days = 30 → expires_at ≈ now + 30 days", async () => {
    const { tx, inserts } = makeTx(30);

    await enrollCommission(tx as never, PARAMS);

    expect(inserts).toHaveLength(1);
    const expiresAt = inserts[0].expires_at as Date;
    expect(expiresAt).toBeInstanceOf(Date);
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.99);
    expect(days).toBeLessThanOrEqual(30.01);
  });

  test("duration_days = 1 → expires_at ≈ now + 1 day", async () => {
    const { tx, inserts } = makeTx(1);

    await enrollCommission(tx as never, PARAMS);

    const expiresAt = inserts[0].expires_at as Date;
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(0.99);
    expect(days).toBeLessThanOrEqual(1.01);
  });

  test("duration_days = -1 (unlimited sentinel) → expires_at NULL", async () => {
    const { tx, inserts } = makeTx(-1);

    await enrollCommission(tx as never, PARAMS);

    expect(inserts[0].expires_at).toBeNull();
  });

  test("still throws AlreadyEnrolledCommissionError on an active enrollment", async () => {
    const { tx, inserts } = makeTx(null);
    // The existing-enrollment check (tx.select on commissionEnrollments) is
    // dispatched per table; give it an active row via a package-shaped
    // override so the throw path is exercised.
    (tx.select as jest.Mock).mockImplementation(() => {
      const chain: any = {
        from: () => {
          const c: any = {
            where: () => c,
            limit: async () => [{ id: "enr-existing" }],
          };
          return c;
        },
      };
      return chain;
    });

    await expect(enrollCommission(tx as never, PARAMS)).rejects.toMatchObject({
      name: "AlreadyEnrolledCommissionError",
    });
    expect(inserts).toHaveLength(0);
  });
});
