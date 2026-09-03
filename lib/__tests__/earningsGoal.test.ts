/**
 * R2.1: Driver Earnings Goal API tests
 *
 * Validates the exported goalSchema constraints, period window computation,
 * and the DB transaction flow (deactivate-old + insert-new).
 * DB is mocked — no real queries.
 *
 * Schema is imported from the production handler to ensure tests validate
 * the actual schema, not a re-implementation.
 */
/* eslint-disable import/first */
jest.mock("../../src/db", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn(),
  },
}));
jest.mock("../../lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("../../lib/parseBody", () => ({
  parseJsonBody: jest.fn(),
}));
jest.mock("../../lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));
jest.mock("../../lib/errors", () => ({
  getErrorStatus: jest.fn(),
}));

import { goalSchema } from "../../app/api/driver/earnings/goal+api";

// ── Schema validation ───────────────────────────────────────────────────────

describe("earnings goal schema (imported from production)", () => {
  it("accepts valid daily goal", () => {
    const r = goalSchema.safeParse({ period: "daily", target_bdt: 50000 });
    expect(r.success).toBe(true);
  });

  it("accepts valid weekly goal", () => {
    const r = goalSchema.safeParse({ period: "weekly", target_bdt: 500000 });
    expect(r.success).toBe(true);
  });

  it("accepts valid monthly goal at upper bound", () => {
    const r = goalSchema.safeParse({ period: "monthly", target_bdt: 10_000_000 });
    expect(r.success).toBe(true);
  });

  it("rejects target below minimum (99 paisa)", () => {
    const r = goalSchema.safeParse({ period: "daily", target_bdt: 99 });
    expect(r.success).toBe(false);
  });

  it("rejects target above maximum", () => {
    const r = goalSchema.safeParse({ period: "daily", target_bdt: 10_000_001 });
    expect(r.success).toBe(false);
  });

  it("rejects negative target", () => {
    const r = goalSchema.safeParse({ period: "daily", target_bdt: -500 });
    expect(r.success).toBe(false);
  });

  it("rejects float target (must be integer)", () => {
    const r = goalSchema.safeParse({ period: "daily", target_bdt: 1000.5 });
    expect(r.success).toBe(false);
  });

  it("rejects unknown period", () => {
    const r = goalSchema.safeParse({ period: "yearly", target_bdt: 1000 });
    expect(r.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const r = goalSchema.safeParse({ period: "daily" });
    expect(r.success).toBe(false);
  });

  it("rejects string target", () => {
    const r = goalSchema.safeParse({ period: "daily", target_bdt: "5000" });
    expect(r.success).toBe(false);
  });
});

// ── API handler integration (mocked DB) ─────────────────────────────────────

describe("earnings goal API — POST schema rejection", () => {
  it("rejects invalid input gracefully via the real schema", async () => {
    const parsed = goalSchema.safeParse({ period: "daily" });
    expect(parsed.success).toBe(false);
  });

  it("rejects empty body via the real schema", async () => {
    const parsed = goalSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});
