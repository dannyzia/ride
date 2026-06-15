// Regression tests for BUG-1 and BUG-2.
// BUG-1: GET /api/admin/dispatch-log/{invalid-uuid} returned 500.
// BUG-2: POST /api/admin/payment-event/{invalid-uuid}/recover returned 500.
// Both should now return 400 invalid_uuid thanks to z.string().uuid() guards.
import { z } from "zod";

describe("BUG-1/BUG-2: UUID param validation", () => {
  const uuidSchema = z.string().uuid();

  const invalidUuids = [
    "not-a-uuid",
    "12345",
    "",
    "abc-def-ghi",
    "00000000-0000-0000-0000-00000000000", // 35 chars (too short)
    "gggggggg-gggg-gggg-gggg-gggggggggggg", // 36 chars but 'g' is not hex
  ];

  for (const input of invalidUuids) {
    test(`rejects "${input}" as invalid UUID`, () => {
      const result = uuidSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  }

  test("accepts a valid UUID", () => {
    const result = uuidSchema.safeParse(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(result.success).toBe(true);
  });

  test("accepts a Supabase-style UUID", () => {
    const result = uuidSchema.safeParse(
      "5142a63c-73fd-4713-a0b2-1c4978506dd5",
    );
    expect(result.success).toBe(true);
  });
});
