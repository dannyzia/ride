/**
 * H3 index / dispatch-filter agreement (candidate-quality regression).
 *
 * The index and the dispatch scoring step must not disagree about who is
 * dispatchable. Until this change they did: `refreshH3Index` rebuilt from
 * `is_online = true` alone, while dispatch.ts's M2 rule hard-excludes anyone
 * whose last heartbeat is older than HEARTBEAT_STALE_MS. A driver could
 * therefore be indexed, counted in `candidatesFound`, and then dropped at
 * scoring.
 *
 * That is not hypothetical. Live, 2026-09-20: a booking built its pool with
 * `candidatesFound: 1` and scored `scored: 0`, because the only indexed driver
 * was `is_online = true` with `last_location_at` 4.2 days old — the app was
 * sitting on a tab that does not run the location heartbeat, so nothing had
 * refreshed its position while the row stayed online.
 *
 * These tests pin:
 *  - the rebuild query carries the freshness predicate AND `is_online = true`,
 *    with a cutoff 120s in the past (the same constant dispatch reads);
 *  - a rebuild EVICTS a driver who is absent from the fresh set, which is the
 *    mechanism that removes a stale driver within one refresh TTL.
 */
jest.mock("../../src/db", () => ({
  db: { select: jest.fn() },
}));
jest.mock("../../lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { db } from "../../src/db";
import {
  HEARTBEAT_STALE_MS,
  getDriversInCells,
  getIndexedDriverCount,
  refreshH3Index,
  removeDriver,
  updateDriver,
} from "../h3Index";

const mockSelect = db.select as jest.Mock;
const dialect = new PgDialect();

/** Capture the `.where()` predicate while resolving `rows`. */
function stubSelect(rows: unknown[], capture?: (predicate: SQL) => void): void {
  mockSelect.mockReturnValue({
    from: () => ({
      where: (predicate: SQL) => {
        capture?.(predicate);
        return Promise.resolve(rows);
      },
    }),
  });
}

afterEach(() => {
  // The index is module-level state shared across tests in this file.
  for (const id of ["d-fresh", "d-gone", "d-other"]) removeDriver(id);
});

describe("refreshH3Index freshness gate", () => {
  it("filters the rebuild by is_online AND last_location_at, using the shared threshold", async () => {
    let predicate: SQL | undefined;
    stubSelect([], (p) => {
      predicate = p;
    });

    const before = Date.now();
    await refreshH3Index();
    const after = Date.now();

    expect(predicate).toBeDefined();
    const { sql, params } = dialect.sqlToQuery(predicate as SQL);

    // Offline drivers were already excluded; the new half is the freshness gate.
    expect(sql).toContain('"is_online"');
    expect(sql).toContain('"last_location_at"');

    // The cutoff must be HEARTBEAT_STALE_MS in the past — the same value
    // dispatch.ts divides by 1000 for its M2 exclusion. The dialect may render
    // the timestamp as a Date or as an ISO string depending on the driver, so
    // normalise both.
    const cutoffMs = params
      .filter((p) => p instanceof Date || typeof p === "string")
      .map((p) => new Date(p as string | Date).getTime())
      .find((ms) => !Number.isNaN(ms));
    expect(cutoffMs).toBeDefined();
    expect(cutoffMs as number).toBeGreaterThanOrEqual(before - HEARTBEAT_STALE_MS);
    expect(cutoffMs as number).toBeLessThanOrEqual(after - HEARTBEAT_STALE_MS);
  });

  it("indexes what the rebuild returned", async () => {
    stubSelect([{ id: "d-fresh", h3_cell_res9: "cellA", vehicle_type: "bike_plus" }]);
    await refreshH3Index();

    expect(getDriversInCells(["cellA"], "bike_plus")).toEqual(["d-fresh"]);
    expect(getIndexedDriverCount()).toBe(1);
  });

  it("evicts a driver absent from the fresh set (how a stale driver leaves the index)", async () => {
    // Present from an earlier heartbeat ...
    updateDriver("d-gone", "cellB", "bike_plus");
    expect(getDriversInCells(["cellB"], "bike_plus")).toEqual(["d-gone"]);

    // ... then the rebuild returns only the still-fresh driver.
    stubSelect([{ id: "d-other", h3_cell_res9: "cellC", vehicle_type: "bike_plus" }]);
    await refreshH3Index();

    expect(getDriversInCells(["cellB"], "bike_plus")).toEqual([]);
    expect(getDriversInCells(["cellC"], "bike_plus")).toEqual(["d-other"]);
    expect(getIndexedDriverCount()).toBe(1);
  });
});
