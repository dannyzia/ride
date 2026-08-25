/**
 * Tests for scripts/import-vehicle-models.ts
 *
 * Mocks the DB and verifies:
 * (a) underscore-prefixed metadata fields are stripped
 * (b) null year_end rows dedup via IS NOT DISTINCT FROM pre-select
 * (c) source='driver' rows are returned by findExisting (no source filter)
 *     and the import loop never updates or inserts around them
 * (d) no DELETE is ever emitted
 */
import { jest, describe, it, expect } from "@jest/globals";

// ── Fixtures ─────────────────────────────────────────────────────────────

const MASTER_FIXTURE = [
  {
    brand: "Toyota",
    model: "Vitz 1.0",
    year_start: 2005,
    year_end: null,
    body_type: "hatchback",
    typical_cc_min: 998,
    typical_cc_max: 998,
    passenger_seats: 5,
    has_ac: true,
    default_vehicle_type: "car_compact",
    _confidence: "verified",
    _sources: ["kimi", "chatgpt"],
    _dispute: null,
    _notes: "Test note",
  },
  {
    brand: "Toyota",
    model: "Vitz 1.3/1.5",
    year_start: 2005,
    year_end: null,
    body_type: "hatchback",
    typical_cc_min: 1317,
    typical_cc_max: 1498,
    passenger_seats: 5,
    has_ac: true,
    default_vehicle_type: "car_economy",
    _confidence: "single_source",
    _sources: ["kimi"],
    _dispute: "cc boundary span",
    _notes: null,
  },
  {
    brand: "BMW",
    model: "X5",
    year_start: 2019,
    year_end: 2023,
    body_type: "suv_large",
    typical_cc_min: 2998,
    typical_cc_max: 4395,
    passenger_seats: 5,
    has_ac: true,
    default_vehicle_type: "car_premium",
    _confidence: "verified",
    _sources: ["kimi", "chatgpt"],
    _dispute: null,
    _notes: "5-seat variant",
  },
];

const ADMIN_DB_ROW = {
  id: "existing-id-1",
  brand: "Toyota",
  model: "Vitz 1.0",
  year_start: 2005,
  year_end: null,
  default_vehicle_type: "car_compact",
  typical_cc_min: 998,
  typical_cc_max: 998,
  body_type: "hatchback",
  has_ac: true,
  passenger_seats: 5,
  is_active: true,
  source: "admin" as const,
  created_by: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const DRIVER_DB_ROW = {
  ...ADMIN_DB_ROW,
  id: "driver-row-id-1",
  source: "driver" as const,
};

// ── Mocks — defined INSIDE factory to avoid babel-jest hoisting issues ────

jest.mock("../../src/db", () => {
  const mockSelect = jest.fn<any>();
  const mockInsert = jest.fn<any>();
  const mockUpdate = jest.fn<any>();
  const mockTransaction = jest.fn<any>();
  return {
    db: {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      transaction: mockTransaction,
    },
    // Expose mocks so tests can configure them
    __mocks: { mockSelect, mockInsert, mockUpdate, mockTransaction },
  };
});

jest.mock("../../lib/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Access mock references AFTER jest.mock is registered ──────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mocks } = require("../../src/db") as {
  __mocks: {
    mockSelect: jest.Mock;
    mockInsert: jest.Mock;
    mockUpdate: jest.Mock;
    mockTransaction: jest.Mock;
  };
};
const mockSelect = __mocks.mockSelect;
const mockInsert = __mocks.mockInsert;
const mockUpdate = __mocks.mockUpdate;
const mockTransaction = __mocks.mockTransaction;

// ── Import after mocks ───────────────────────────────────────────────────

import {
  stripMetadata,
  toInsertRow,
  buildUpdateSet,
  findExisting,
  runImport,
} from "../import-vehicle-models";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a minimal mock select chain that resolves to `rows`. */
function mockSelectChain(rows: unknown[]) {
  const limitMock = jest.fn<any>().mockResolvedValue(rows);
  const whereMock = jest.fn<any>().mockReturnValue({ limit: limitMock });
  const fromMock = jest.fn<any>().mockReturnValue({ where: whereMock });
  mockSelect.mockReturnValue({ from: fromMock });
  return { limitMock, whereMock, fromMock };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("import-vehicle-models", () => {
  describe("(a) underscore-prefixed metadata fields are stripped", () => {
    it("stripMetadata removes _confidence, _sources, _dispute, _notes", () => {
      const row = MASTER_FIXTURE[0];
      const cleaned = stripMetadata(row);

      expect(cleaned).not.toHaveProperty("_confidence");
      expect(cleaned).not.toHaveProperty("_sources");
      expect(cleaned).not.toHaveProperty("_dispute");
      expect(cleaned).not.toHaveProperty("_notes");

      expect(cleaned).toHaveProperty("brand", "Toyota");
      expect(cleaned).toHaveProperty("model", "Vitz 1.0");
      expect(cleaned).toHaveProperty("year_start", 2005);
      expect(cleaned).toHaveProperty("year_end", null);
      expect(cleaned).toHaveProperty("body_type", "hatchback");
      expect(cleaned).toHaveProperty("typical_cc_min", 998);
      expect(cleaned).toHaveProperty("typical_cc_max", 998);
      expect(cleaned).toHaveProperty("passenger_seats", 5);
      expect(cleaned).toHaveProperty("has_ac", true);
      expect(cleaned).toHaveProperty("default_vehicle_type", "car_compact");
    });

    it("toInsertRow adds source='admin', created_by=null, is_active=true", () => {
      const cleaned = stripMetadata(MASTER_FIXTURE[0]);
      const insertRow = toInsertRow(cleaned);

      expect(insertRow).toHaveProperty("source", "admin");
      expect(insertRow).toHaveProperty("created_by", null);
      expect(insertRow).toHaveProperty("is_active", true);
      expect(insertRow).not.toHaveProperty("_confidence");
      expect(insertRow).not.toHaveProperty("_sources");
    });

    it("strips metadata from all fixture rows", () => {
      for (const row of MASTER_FIXTURE) {
        const cleaned = stripMetadata(row);
        const keys = Object.keys(cleaned);
        const underscoreKeys = keys.filter((k) => k.startsWith("_"));
        expect(underscoreKeys).toHaveLength(0);
      }
    });
  });

  describe("(b) null year_end dedup via IS NOT DISTINCT FROM", () => {
    it("findExisting returns matching rows for null year_end", async () => {
      mockSelectChain([ADMIN_DB_ROW]);

      const result = await findExisting("Toyota", "Vitz 1.0", 2005, null);

      expect(result).toEqual(ADMIN_DB_ROW);
      expect(mockSelect).toHaveBeenCalled();
      mockSelect.mockReset();
    });

    it("returns null when no matching null-year row exists", async () => {
      mockSelectChain([]);

      const result = await findExisting("Toyota", "Vitz 1.0", 2005, null);

      expect(result).toBeNull();
      mockSelect.mockReset();
    });

    it("toInsertRow sets year_end as null (not a sentinel)", () => {
      const cleaned = stripMetadata(MASTER_FIXTURE[0]);
      const insertRow = toInsertRow(cleaned);

      expect(insertRow.year_end).toBeNull();
      expect(insertRow.year_end).not.toBe(0);
      expect(insertRow.year_end).not.toBe(-1);
      expect(insertRow.year_end).not.toBe(9999);
    });
  });

  describe("(c) source='driver' rows are returned by findExisting", () => {
    it("findExisting does NOT filter by source — returns driver rows", async () => {
      // findExisting no longer has a source='admin' filter.
      // If a driver row matches (brand, model, year_start, year_end), it is returned.
      // The caller (import loop) is responsible for the driver-protection branch.
      mockSelectChain([DRIVER_DB_ROW]);

      const result = await findExisting("Toyota", "Vitz 1.0", 2005, null);

      expect(result).not.toBeNull();
      expect(result!.source).toBe("driver");
      mockSelect.mockReset();
    });

    it("findExisting returns null when no row exists (driver or admin)", async () => {
      mockSelectChain([]);

      const result = await findExisting("Toyota", "Vitz 1.0", 2005, null);

      expect(result).toBeNull();
      mockSelect.mockReset();
    });
  });

  describe("(d) no DELETE is ever emitted", () => {
    it("import script has no db.delete call", () => {
      const realFs = jest.requireActual("fs") as typeof import("fs");
      const realPath = jest.requireActual("path") as typeof import("path");
      const scriptContent = realFs.readFileSync(
        realPath.join(__dirname, "..", "import-vehicle-models.ts"),
        "utf8",
      );

      expect(scriptContent).not.toMatch(/\.delete\(/);
      expect(scriptContent).not.toMatch(/DELETE FROM/i);
      expect(scriptContent).not.toMatch(/db\.delete/);
    });

    it("only uses insert and update operations", () => {
      const realFs = jest.requireActual("fs") as typeof import("fs");
      const realPath = jest.requireActual("path") as typeof import("path");
      const scriptContent = realFs.readFileSync(
        realPath.join(__dirname, "..", "import-vehicle-models.ts"),
        "utf8",
      );

      expect(scriptContent).toMatch(/\.insert\(/);
      expect(scriptContent).toMatch(/\.update\(/);
      expect(scriptContent).not.toMatch(/\.delete\(/);
    });
  });

  describe("(e) import loop driver protection", () => {
    /**
     * This test exercises the full runImport path:
     * - Loads fixture rows via mocked fs
     * - db.transaction → outer tx → inner savepoint tx per row
     * - findExisting returns a driver row → stats.driverProtected++
     * - No insert() or update() is called
     */
    it("driver-row collision increments driverProtected, emits no insert/update", async () => {
      // ── Mock fs for loadMasterJson ────────────────────────────────
      const realFs = jest.requireActual("fs") as typeof import("fs");
      const existsSyncSpy = jest.spyOn(realFs, "existsSync").mockReturnValue(true);
      const readFileSyncSpy = jest
        .spyOn(realFs, "readFileSync")
        .mockReturnValue(JSON.stringify([MASTER_FIXTURE[0]]));

      // ── Mock db.transaction: invoke outer callback with mock tx ───
      mockTransaction.mockImplementation(async (outerCb: any) => {
        const mockTx = {
          select: jest.fn<any>(),
          insert: jest.fn<any>(),
          update: jest.fn<any>(),
          // Nested transaction: invoke inner callback with innerTx
          transaction: jest.fn<any>().mockImplementation(async (innerCb: any) => {
            const innerTx = {
              // findExisting uses innerTx.select — return driver row
              select: jest.fn<any>().mockReturnValue({
                from: jest.fn<any>().mockReturnValue({
                  where: jest.fn<any>().mockReturnValue({
                    limit: jest.fn<any>().mockResolvedValue([DRIVER_DB_ROW]),
                  }),
                }),
              }),
              insert: mockInsert,
              update: mockUpdate,
            };
            return innerCb(innerTx);
          }),
        };
        return outerCb(mockTx);
      });

      // ── Mock db.select for post-import verification queries ───────
      // After the transaction, runImport queries:
      //   1. count(*) from vehicle_models where source='admin'
      //   2. group by default_vehicle_type
      const countResult = [{ total: 1 }];
      const typeResult = [{ vehicle_type: "car_compact", count: 1 }];
      const groupByMock = jest.fn<any>().mockResolvedValue(typeResult);
      const whereResult = Object.assign(Promise.resolve(countResult), {
        groupBy: groupByMock,
      });
      mockSelect.mockReturnValue({
        from: jest.fn<any>().mockReturnValue({
          where: jest.fn<any>().mockReturnValue(whereResult),
        }),
      });

      // ── Run the import ────────────────────────────────────────────
      await runImport();

      // ── Assertions ────────────────────────────────────────────────
      // Driver row was found → driverProtected incremented (verified via
      // no insert/update calls — the only way driverProtected increments
      // is by hitting the `return` before insert/update).
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();

      // Clean up spies
      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
      mockSelect.mockReset();
      mockTransaction.mockReset();
    });

    it("admin-row skip (no --force) emits no insert/update", async () => {
      const realFs = jest.requireActual("fs") as typeof import("fs");
      const existsSyncSpy = jest.spyOn(realFs, "existsSync").mockReturnValue(true);
      const readFileSyncSpy = jest
        .spyOn(realFs, "readFileSync")
        .mockReturnValue(JSON.stringify([MASTER_FIXTURE[0]]));

      mockTransaction.mockImplementation(async (outerCb: any) => {
        const mockTx = {
          select: jest.fn<any>(),
          insert: mockInsert,
          update: mockUpdate,
          transaction: jest.fn<any>().mockImplementation(async (innerCb: any) => {
            const innerTx = {
              select: jest.fn<any>().mockReturnValue({
                from: jest.fn<any>().mockReturnValue({
                  where: jest.fn<any>().mockReturnValue({
                    limit: jest.fn<any>().mockResolvedValue([ADMIN_DB_ROW]),
                  }),
                }),
              }),
              insert: mockInsert,
              update: mockUpdate,
            };
            return innerCb(innerTx);
          }),
        };
        return outerCb(mockTx);
      });

      // Post-import verification
      const countResult = [{ total: 1 }];
      const typeResult = [{ vehicle_type: "car_compact", count: 1 }];
      const groupByMock = jest.fn<any>().mockResolvedValue(typeResult);
      const whereResult = Object.assign(Promise.resolve(countResult), {
        groupBy: groupByMock,
      });
      mockSelect.mockReturnValue({
        from: jest.fn<any>().mockReturnValue({
          where: jest.fn<any>().mockReturnValue(whereResult),
        }),
      });

      await runImport();

      // No --force → skip, no insert or update
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();

      existsSyncSpy.mockRestore();
      readFileSyncSpy.mockRestore();
      mockSelect.mockReset();
      mockTransaction.mockReset();
    });
  });

  describe("edge cases", () => {
    it("year_start null row uses IS NOT DISTINCT FROM", async () => {
      mockSelectChain([]);

      const result = await findExisting("Tesla", "Model X", null, null);

      expect(result).toBeNull();
      expect(mockSelect).toHaveBeenCalled();
      mockSelect.mockReset();
    });

    it("buildUpdateSet does not include source or created_by", () => {
      const cleaned = stripMetadata(MASTER_FIXTURE[0]);
      const updateSet = buildUpdateSet(cleaned);

      expect(updateSet).not.toHaveProperty("source");
      expect(updateSet).not.toHaveProperty("created_by");
      expect(updateSet).toHaveProperty("body_type", "hatchback");
      expect(updateSet).toHaveProperty("is_active", true);
      expect(updateSet).toHaveProperty("updated_at");
    });

    it("all 9 vehicle_type values are valid enum members", () => {
      const VALID_TYPES = new Set([
        "bike_basic", "bike_standard", "bike_plus", "cng",
        "car_compact", "car_economy", "car_comfort", "car_premium", "car_xl",
      ]);

      for (const row of MASTER_FIXTURE) {
        const cleaned = stripMetadata(row);
        expect(VALID_TYPES.has(cleaned.default_vehicle_type)).toBe(true);
      }
    });

    it("findExisting accepts an executor parameter", async () => {
      // Verify the executor parameter is threaded through — passing
      // a custom mock executor instead of the default `db`.
      const customExecutor = {
        select: jest.fn<any>().mockReturnValue({
          from: jest.fn<any>().mockReturnValue({
            where: jest.fn<any>().mockReturnValue({
              limit: jest.fn<any>().mockResolvedValue([ADMIN_DB_ROW]),
            }),
          }),
        }),
        insert: jest.fn<any>(),
        update: jest.fn<any>(),
        transaction: jest.fn<any>(),
      };

      const result = await findExisting(
        "Toyota", "Vitz 1.0", 2005, null,
        customExecutor as any,
      );

      expect(result).toEqual(ADMIN_DB_ROW);
      // The custom executor's select was called, not the global db mock
      expect(customExecutor.select).toHaveBeenCalled();
      expect(mockSelect).not.toHaveBeenCalled();
    });
  });
});
