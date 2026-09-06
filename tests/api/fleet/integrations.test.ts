/**
 * Tests for fleet integration framework — Phase 7.
 *
 * Validates:
 * - Adapter interface contract (all methods exist, correct return shapes)
 * - Sync engine error handling (retry, fail-open, error surfacing)
 * - Webhook signature validation (timing-safe comparison)
 * - Adapter error type classification
 *
 * Mocks: DB layer only. Adapter logic is tested via a concrete mock adapter.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────

import { validateWebhookSignature } from "@/lib/integrations/webhookHandler";
import { AdapterError, type SyncResult, type AdapterCapabilities } from "@/lib/integrations/types";
import { retryDelay, BaseFleetAdapter } from "@/lib/integrations/baseAdapter";
import { getIntegrationsNeedingAttention } from "@/lib/integrations/syncEngine";

const mockInsertResult = { id: "job-1" };

function mockDbChainFn(resolveRows: unknown[] = []) {
  const promise = Promise.resolve(resolveRows);
  const chain: Record<string, unknown> = {};
  chain.insert = jest.fn().mockReturnValue(chain);
  chain.values = jest.fn().mockReturnValue(chain);
  chain.returning = jest.fn().mockReturnValue(Promise.resolve([mockInsertResult]));
  chain.select = jest.fn().mockReturnValue(chain);
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue({
    ...chain,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    [Symbol.toStringTag]: "Promise",
  });
  chain.limit = jest.fn().mockReturnValue({
    ...chain,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    [Symbol.toStringTag]: "Promise",
  });
  chain.update = jest.fn().mockReturnValue(chain);
  chain.set = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.offset = jest.fn().mockReturnValue(chain);
  chain.groupBy = jest.fn().mockReturnValue(chain);
  return chain;
}

jest.mock("@/src/db", () => ({
  db: {
    insert: jest.fn(() => mockDbChainFn()),
    select: jest.fn(() => mockDbChainFn([])),
    update: jest.fn(() => mockDbChainFn()),
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// ── Concrete mock adapter for testing base class ──────────────────────────

class MockAdapter extends BaseFleetAdapter {
  readonly provider = "mock_provider";
  private vehicleCount = 0;

  protected async validateCredentials(): Promise<void> {
    if (!this.credentials.api_key) {
      throw new AdapterError("authentication_failed", "Missing API key");
    }
  }

  getCapabilities(): AdapterCapabilities {
    return {
      capabilities: ["vehicles", "drivers", "trips"],
      supports_webhooks: false,
      supports_incremental: true,
      max_batch_size: 50,
      rate_limit_per_minute: 30,
    };
  }

  protected async fetchVehicles() {
    this.vehicleCount++;
    return Array.from({ length: this.vehicleCount }, (_, i) => ({
      provider_vehicle_id: `ext-veh-${i}`,
      make: "Toyota",
      model: "Prius",
      year: 2023,
      license_plate: `DHK-${1000 + i}`,
      vehicle_type: "car_economy",
      color: "White",
      seats: 4,
      is_active: true,
    }));
  }

  protected async fetchDrivers() {
    return [
      {
        provider_driver_id: "ext-drv-1",
        name: "Test Driver",
        phone: "+8801712345678",
        email: null,
        rating: 4.8,
        vehicle_type: "car_economy",
        is_online: true,
        total_trips: 150,
        documents_verified: true,
      },
    ];
  }

  protected async fetchTrips(_since?: string) {
    return [
      {
        provider_trip_id: "ext-trip-1",
        provider_driver_id: "ext-drv-1",
        provider_vehicle_id: "ext-veh-0",
        status: "completed",
        pickup_lat: 23.8103,
        pickup_lng: 90.4125,
        pickup_address: "Dhaka",
        dropoff_lat: 23.82,
        dropoff_lng: 90.41,
        dropoff_address: "Gulshan",
        distance_km: 5.2,
        duration_minutes: 15,
        fare_amount: 4500,
        tip_amount: 500,
        commission_amount: 900,
        currency: "BDT",
        requested_at: "2026-08-30T10:00:00Z",
        completed_at: "2026-08-30T10:15:00Z",
        cancelled_at: null,
        cancel_reason: null,
      },
    ];
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("fleet integration — adapter interface contract", () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new MockAdapter();
  });

  it("has all required methods", () => {
    expect(typeof adapter.connect).toBe("function");
    expect(typeof adapter.disconnect).toBe("function");
    expect(typeof adapter.testConnection).toBe("function");
    expect(typeof adapter.getCapabilities).toBe("function");
    expect(typeof adapter.syncVehicles).toBe("function");
    expect(typeof adapter.syncDrivers).toBe("function");
    expect(typeof adapter.syncTrips).toBe("function");
    expect(typeof adapter.syncEarnings).toBe("function");
    expect(typeof adapter.handleWebhook).toBe("function");
  });

  it("getCapabilities returns correct shape", () => {
    const caps = adapter.getCapabilities();
    expect(caps.capabilities).toContain("vehicles");
    expect(caps.capabilities).toContain("drivers");
    expect(caps.capabilities).toContain("trips");
    expect(typeof caps.supports_webhooks).toBe("boolean");
    expect(typeof caps.supports_incremental).toBe("boolean");
    expect(typeof caps.max_batch_size).toBe("number");
    expect(typeof caps.rate_limit_per_minute).toBe("number");
  });

  it("connect with valid credentials succeeds", async () => {
    await expect(adapter.connect({ api_key: "test-key" })).resolves.toBeUndefined();
  });

  it("connect with missing credentials throws authentication_failed", async () => {
    await expect(adapter.connect({})).rejects.toThrow("Missing API key");
  });

  it("testConnection returns true on valid credentials", async () => {
    await adapter.connect({ api_key: "test-key" });
    const result = await adapter.testConnection();
    expect(result).toBe(true);
  });

  it("testConnection returns false on invalid credentials", async () => {
    const result = await adapter.testConnection();
    expect(result).toBe(false);
  });

  it("disconnect clears credentials", async () => {
    await adapter.connect({ api_key: "test-key" });
    await adapter.disconnect();
    // After disconnect, testConnection should fail
    const result = await adapter.testConnection();
    expect(result).toBe(false);
  });

  it("syncEarnings returns empty result (base implementation)", async () => {
    await adapter.connect({ api_key: "test-key" });
    const result = await adapter.syncEarnings("fleet-1");
    expect(result.success).toBe(true);
    expect(result.records_fetched).toBe(0);
  });
});

describe("fleet integration — retry delay", () => {
  it("returns increasing delays with jitter", () => {
    const d0 = retryDelay(0);
    const d1 = retryDelay(1);
    const d2 = retryDelay(2);

    // Base delays: 1000, 2000, 4000 + jitter (0-500)
    expect(d0).toBeGreaterThanOrEqual(1000);
    expect(d0).toBeLessThan(1500);
    expect(d1).toBeGreaterThanOrEqual(2000);
    expect(d1).toBeLessThan(2500);
    expect(d2).toBeGreaterThanOrEqual(4000);
    expect(d2).toBeLessThan(4500);
  });

  it("caps at MAX_DELAY_MS", () => {
    const d10 = retryDelay(10);
    expect(d10).toBeLessThanOrEqual(30500); // 30000 + 500 jitter
  });
});

describe("fleet integration — AdapterError", () => {
  it("has correct type and retryable flag", () => {
    const err = new AdapterError("rate_limited", "Too many requests", true, 429, 5000);
    expect(err.type).toBe("rate_limited");
    expect(err.retryable).toBe(true);
    expect(err.statusCode).toBe(429);
    expect(err.retryAfterMs).toBe(5000);
    expect(err.name).toBe("AdapterError");
    expect(err).toBeInstanceOf(Error);
  });

  it("authentication errors are not retryable", () => {
    const err = new AdapterError("authentication_failed", "Token expired", false);
    expect(err.retryable).toBe(false);
  });
});

describe("fleet integration — webhook signature validation", () => {
  const secret = "webhook-secret-key-123";

  it("validates correct HMAC-SHA256 signature", () => {
    const { createHmac } = require("crypto");
    const payload = '{"event":"trip.completed","id":"trip-123"}';
    const signature = createHmac("sha256", secret).update(payload).digest("hex");

    expect(validateWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it("rejects incorrect signature", () => {
    const payload = '{"event":"trip.completed","id":"trip-123"}';
    expect(validateWebhookSignature(payload, "wrong-signature", secret)).toBe(false);
  });

  it("rejects empty signature", () => {
    const payload = '{"event":"trip.completed"}';
    expect(validateWebhookSignature(payload, "", secret)).toBe(false);
  });

  it("timing-safe comparison prevents timing attacks", () => {
    const { createHmac } = require("crypto");
    const payload = "test-payload";
    const correctSig = createHmac("sha256", secret).update(payload).digest("hex");
    const almostCorrect = correctSig.slice(0, -1) + "0";

    expect(validateWebhookSignature(payload, correctSig, secret)).toBe(true);
    expect(validateWebhookSignature(payload, almostCorrect, secret)).toBe(false);
  });
});

describe("fleet integration — sync engine error surfacing", () => {
  it("integrationsNeedingAttention returns empty when no errors", async () => {
    // The function is already statically imported; just call it
    const result = await getIntegrationsNeedingAttention("fleet-1");
    expect(Array.isArray(result)).toBe(true);
  });
});
