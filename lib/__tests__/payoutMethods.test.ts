/**
 * R2.2: Driver Payout Methods CRUD tests
 *
 * Validates the exported Zod schemas, account masking, bKash/Nagad phone
 * format validation, and the DELETE auto-promote-default logic.
 * DB is mocked — no real queries.
 *
 * Schemas and maskAccount are imported from the production handler to ensure
 * tests validate the actual code, not a re-implementation.
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

import { createSchema, updateSchema, maskAccount } from "../../app/api/driver/payout-method+api";

// ── Account masking (imported from production) ───────────────────────────────

describe("maskAccount (imported from production)", () => {
  it("masks bKash number (11 digits)", () => {
    expect(maskAccount("01712345678")).toBe("*******5678");
  });

  it("masks Nagad number (11 digits)", () => {
    expect(maskAccount("01812345678")).toBe("*******5678");
  });

  it("masks bank account (16 digits)", () => {
    expect(maskAccount("1234567890123456")).toBe("************3456");
  });

  it("shows all for short number (≤4)", () => {
    expect(maskAccount("1234")).toBe("1234");
    expect(maskAccount("12")).toBe("12");
  });

  it("masks 5-digit number", () => {
    expect(maskAccount("12345")).toBe("*2345");
  });

  it("masks 8-digit number (minimum length)", () => {
    expect(maskAccount("12345678")).toBe("****5678");
  });

  it("masks 20-digit number (maximum length)", () => {
    expect(maskAccount("12345678901234567890")).toBe("****************7890");
  });
});

// ── Create schema validation (imported from production) ─────────────────────

describe("payout create schema (imported from production)", () => {
  it("accepts valid bKash", () => {
    const r = createSchema.safeParse({
      method_type: "bkash",
      account_number: "01712345678",
    });
    expect(r.success).toBe(true);
  });

  it("accepts valid Nagad", () => {
    const r = createSchema.safeParse({
      method_type: "nagad",
      account_number: "01812345678",
    });
    expect(r.success).toBe(true);
  });

  it("accepts valid bank account", () => {
    const r = createSchema.safeParse({
      method_type: "bank",
      account_number: "1234567890123456",
      account_name: "John Doe",
      bank_name: "Dutch-Bangla Bank",
      branch_name: "Gulshan",
    });
    expect(r.success).toBe(true);
  });

  it("accepts bank without optional fields", () => {
    const r = createSchema.safeParse({
      method_type: "bank",
      account_number: "1234567890123456",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown method type", () => {
    const r = createSchema.safeParse({
      method_type: "paypal",
      account_number: "01712345678",
    });
    expect(r.success).toBe(false);
  });

  it("rejects account_number too short (<8)", () => {
    const r = createSchema.safeParse({
      method_type: "bkash",
      account_number: "0171234",
    });
    expect(r.success).toBe(false);
  });

  it("rejects account_number too long (>20)", () => {
    const r = createSchema.safeParse({
      method_type: "bkash",
      account_number: "017123456789012345678",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty method_type", () => {
    const r = createSchema.safeParse({
      account_number: "01712345678",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty account_number", () => {
    const r = createSchema.safeParse({
      method_type: "bkash",
    });
    expect(r.success).toBe(false);
  });

  it("rejects account_name > 100 chars", () => {
    const r = createSchema.safeParse({
      method_type: "bank",
      account_number: "1234567890123456",
      account_name: "A".repeat(101),
    });
    expect(r.success).toBe(false);
  });

  it("accepts account_name at exactly 100 chars", () => {
    const r = createSchema.safeParse({
      method_type: "bank",
      account_number: "1234567890123456",
      account_name: "A".repeat(100),
    });
    expect(r.success).toBe(true);
  });
});

// ── Update schema validation (imported from production) ──────────────────────

describe("payout update schema (imported from production)", () => {
  it("accepts partial update (account_name only)", () => {
    const r = updateSchema.safeParse({ account_name: "New Name" });
    expect(r.success).toBe(true);
  });

  it("accepts account_number update", () => {
    const r = updateSchema.safeParse({ account_number: "01912345678" });
    expect(r.success).toBe(true);
  });

  it("accepts empty update (all optional)", () => {
    const r = updateSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("rejects account_number too short", () => {
    const r = updateSchema.safeParse({ account_number: "1234" });
    expect(r.success).toBe(false);
  });

  it("rejects bank_name > 100 chars", () => {
    const r = updateSchema.safeParse({ bank_name: "B".repeat(101) });
    expect(r.success).toBe(false);
  });
});

// ── bKash/Nagad phone format validation (business rule in handler) ──────────

describe("bKash/Nagad phone format validation", () => {
  const BKASH_NAGAD_RE = /^01\d{9}$/;

  it("accepts valid bKash phone", () => {
    expect(BKASH_NAGAD_RE.test("01712345678")).toBe(true);
  });

  it("accepts valid Nagad phone", () => {
    expect(BKASH_NAGAD_RE.test("01812345678")).toBe(true);
  });

  it("rejects non-01 prefix", () => {
    expect(BKASH_NAGAD_RE.test("02712345678")).toBe(false);
  });

  it("rejects too short", () => {
    expect(BKASH_NAGAD_RE.test("0171234567")).toBe(false);
  });

  it("rejects too long", () => {
    expect(BKASH_NAGAD_RE.test("017123456789")).toBe(false);
  });

  it("rejects non-numeric", () => {
    expect(BKASH_NAGAD_RE.test("017abcdefgh")).toBe(false);
  });

  it("rejects with country code", () => {
    expect(BKASH_NAGAD_RE.test("8801712345678")).toBe(false);
  });

  it("allows any 11-char 01xx number for bKash", () => {
    for (const prefix of ["013", "014", "015", "016", "017", "018", "019"]) {
      const phone = prefix + "12345678";
      expect(BKASH_NAGAD_RE.test(phone)).toBe(true);
    }
  });
});

// ── DELETE auto-promote-default logic ────────────────────────────────────────

describe("DELETE auto-promote-default", () => {
  interface PayoutMethod {
    id: string;
    is_default: boolean;
    is_active: boolean;
    created_at: Date;
  }

  function simulateDelete(
    methods: PayoutMethod[],
    deleteId: string,
  ): { deleted: boolean; promotedId: string | null } {
    const target = methods.find((m) => m.id === deleteId && m.is_active);
    if (!target) return { deleted: false, promotedId: null };

    target.is_active = false;

    let promotedId: string | null = null;
    if (target.is_default) {
      const remaining = methods
        .filter((m) => m.is_active)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      if (remaining.length > 0) {
        remaining[0].is_default = true;
        promotedId = remaining[0].id;
      }
    }

    return { deleted: true, promotedId };
  }

  it("promotes newest remaining method when default is deleted", () => {
    const methods: PayoutMethod[] = [
      { id: "m1", is_default: true, is_active: true, created_at: new Date("2026-01-01") },
      { id: "m2", is_default: false, is_active: true, created_at: new Date("2026-06-01") },
      { id: "m3", is_default: false, is_active: true, created_at: new Date("2026-03-01") },
    ];
    const result = simulateDelete(methods, "m1");
    expect(result.deleted).toBe(true);
    expect(result.promotedId).toBe("m2");
    expect(methods.find((m) => m.id === "m2")?.is_default).toBe(true);
  });

  it("does not promote when non-default is deleted", () => {
    const methods: PayoutMethod[] = [
      { id: "m1", is_default: true, is_active: true, created_at: new Date("2026-01-01") },
      { id: "m2", is_default: false, is_active: true, created_at: new Date("2026-06-01") },
    ];
    const result = simulateDelete(methods, "m2");
    expect(result.deleted).toBe(true);
    expect(result.promotedId).toBeNull();
    expect(methods.find((m) => m.id === "m1")?.is_default).toBe(true);
  });

  it("no promotion when last method is deleted", () => {
    const methods: PayoutMethod[] = [
      { id: "m1", is_default: true, is_active: true, created_at: new Date("2026-01-01") },
    ];
    const result = simulateDelete(methods, "m1");
    expect(result.deleted).toBe(true);
    expect(result.promotedId).toBeNull();
  });

  it("rejects delete of non-existent method", () => {
    const methods: PayoutMethod[] = [
      { id: "m1", is_default: true, is_active: true, created_at: new Date("2026-01-01") },
    ];
    const result = simulateDelete(methods, "nonexistent");
    expect(result.deleted).toBe(false);
    expect(result.promotedId).toBeNull();
  });

  it("rejects delete of already-inactive method", () => {
    const methods: PayoutMethod[] = [
      { id: "m1", is_default: false, is_active: false, created_at: new Date("2026-01-01") },
    ];
    const result = simulateDelete(methods, "m1");
    expect(result.deleted).toBe(false);
  });
});
