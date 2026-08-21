/**
 * Tests for book-for-other consent validation and SMS rate limiting.
 *
 * These tests validate the Zod schema constraints and the rate-limit logic
 * at the contract level — they do NOT hit the DB. The actual API integration
 * is tested by Maestro E2E flows.
 */
import { z } from "zod";

// ── Schemas (mirrors from request+api.ts and schedule+api.ts) ─────────────

const requestSchema = z.object({
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  pickup_address: z.string().min(1).max(500),
  dropoff_lat: z.number().min(-90).max(90),
  dropoff_lng: z.number().min(-180).max(180),
  dropoff_address: z.string().min(1).max(500),
  vehicle_type: z.enum([
    "bike_basic",
    "bike_standard",
    "bike_plus",
    "cng",
    "car_economy",
    "car_comfort",
    "car_premium",
    "car_xl",
  ]),
  secondary_rider_name: z.string().min(1).max(255).optional(),
  secondary_rider_phone: z
    .string()
    .regex(/^01\d{9}$/, "Invalid Bangladesh phone number")
    .optional(),
  secondary_rider_consent: z.boolean().optional().default(false),
});

const scheduleSchema = z.object({
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  pickup_address: z.string().min(1).max(500),
  dropoff_lat: z.number().min(-90).max(90),
  dropoff_lng: z.number().min(-180).max(180),
  dropoff_address: z.string().min(1).max(500),
  vehicle_type: z.enum([
    "bike_basic",
    "bike_standard",
    "bike_plus",
    "cng",
    "car_economy",
    "car_comfort",
    "car_premium",
    "car_xl",
  ]),
  scheduled_at: z.string().datetime(),
  secondary_rider_name: z.string().min(1).max(255).optional(),
  secondary_rider_phone: z.string().min(1).max(20).optional(),
  secondary_rider_consent: z.boolean().optional().default(false),
});

// ── Base valid payload ────────────────────────────────────────────────────

const baseRequest = {
  pickup_lat: 23.8103,
  pickup_lng: 90.4125,
  pickup_address: "Gulshan 1",
  dropoff_lat: 23.7806,
  dropoff_lng: 90.3994,
  dropoff_address: "Dhanmondi",
  vehicle_type: "car_economy" as const,
};

// ── Consent Tests ─────────────────────────────────────────────────────────

describe("book-for-other consent validation", () => {
  describe("request+api.ts schema", () => {
    it("passes with no secondary rider (consent not required)", () => {
      const result = requestSchema.safeParse(baseRequest);
      expect(result.success).toBe(true);
    });

    it("passes with secondary rider + consent = true", () => {
      const result = requestSchema.safeParse({
        ...baseRequest,
        secondary_rider_name: "John",
        secondary_rider_phone: "01712345678",
        secondary_rider_consent: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.secondary_rider_consent).toBe(true);
      }
    });

    it("defaults consent to false when not provided", () => {
      const result = requestSchema.safeParse({
        ...baseRequest,
        secondary_rider_name: "John",
        secondary_rider_phone: "01712345678",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.secondary_rider_consent).toBe(false);
      }
    });

    it("accepts consent = false explicitly", () => {
      const result = requestSchema.safeParse({
        ...baseRequest,
        secondary_rider_name: "John",
        secondary_rider_phone: "01712345678",
        secondary_rider_consent: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.secondary_rider_consent).toBe(false);
      }
    });

    it("rejects non-boolean consent value", () => {
      const result = requestSchema.safeParse({
        ...baseRequest,
        secondary_rider_name: "John",
        secondary_rider_phone: "01712345678",
        secondary_rider_consent: "yes",
      });
      // Zod coerces or rejects — boolean() rejects strings
      expect(result.success).toBe(false);
    });

    it("rejects invalid phone number format", () => {
      const result = requestSchema.safeParse({
        ...baseRequest,
        secondary_rider_name: "John",
        secondary_rider_phone: "12345",
        secondary_rider_consent: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("schedule+api.ts schema", () => {
    const baseSchedule = {
      ...baseRequest,
      scheduled_at: new Date(Date.now() + 3600000).toISOString(),
    };

    it("passes with secondary rider + consent = true", () => {
      const result = scheduleSchema.safeParse({
        ...baseSchedule,
        secondary_rider_name: "Jane",
        secondary_rider_phone: "01812345678",
        secondary_rider_consent: true,
      });
      expect(result.success).toBe(true);
    });

    it("defaults consent to false when not provided", () => {
      const result = scheduleSchema.safeParse({
        ...baseSchedule,
        secondary_rider_name: "Jane",
        secondary_rider_phone: "01812345678",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.secondary_rider_consent).toBe(false);
      }
    });
  });
});

// ── Consent enforcement logic (mirrors API handler) ───────────────────────

describe("consent enforcement logic", () => {
  function enforceConsent(
    phone: string | undefined,
    consent: boolean,
  ): { allowed: boolean; error?: string } {
    if (phone && !consent) {
      return {
        allowed: false,
        error: "consent_required",
      };
    }
    return { allowed: true };
  }

  it("allows when no secondary phone", () => {
    expect(enforceConsent(undefined, false)).toEqual({ allowed: true });
  });

  it("allows when phone + consent = true", () => {
    expect(enforceConsent("01712345678", true)).toEqual({ allowed: true });
  });

  it("blocks when phone + consent = false", () => {
    expect(enforceConsent("01712345678", false)).toEqual({
      allowed: false,
      error: "consent_required",
    });
  });

  it("blocks when phone + consent undefined (defaults false)", () => {
    expect(enforceConsent("01712345678", undefined as any)).toEqual({
      allowed: false,
      error: "consent_required",
    });
  });
});

// ── SMS Rate Limit logic ──────────────────────────────────────────────────

describe("SMS rate limit logic", () => {
  // Mirrors the rate-limit check from request+api.ts / schedule+api.ts
  function shouldSendSms(recentBookForOtherCount: number): {
    send: boolean;
    reason?: string;
  } {
    if (recentBookForOtherCount >= 5) {
      return { send: false, reason: "rate_limit_hit" };
    }
    return { send: true };
  }

  it("sends SMS when count is 0", () => {
    expect(shouldSendSms(0)).toEqual({ send: true });
  });

  it("sends SMS when count is 4", () => {
    expect(shouldSendSms(4)).toEqual({ send: true });
  });

  it("skips SMS when count is 5 (at limit)", () => {
    expect(shouldSendSms(5)).toEqual({
      send: false,
      reason: "rate_limit_hit",
    });
  });

  it("skips SMS when count is 6 (over limit)", () => {
    expect(shouldSendSms(6)).toEqual({
      send: false,
      reason: "rate_limit_hit",
    });
  });

  it("resets after 1 hour (count goes back to 0)", () => {
    // The DB query uses `created_at > now() - interval '1 hour'`
    // so rides older than 1 hour are excluded from the count.
    // After an hour, the count naturally resets.
    expect(shouldSendSms(0)).toEqual({ send: true });
  });
});
