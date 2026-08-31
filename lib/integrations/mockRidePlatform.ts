/**
 * MockRidePlatform — deterministic mock adapter for testing the full
 * fleet integration pipeline without third-party API access.
 *
 * Generates consistent, deterministic data keyed by fleet_id so that:
 * - syncVehicles() always produces the same provider_vehicle_id values
 * - syncDrivers() always produces the same provider_driver_id values
 * - syncTrips() always produces the same external_trip_id values
 *
 * This actively tests external_entity_mappings idempotency and deduplication:
 * running sync twice must NOT create duplicate mappings or trips.
 *
 * Money fields: integer paisa (BDT) throughout.
 */

import { BaseFleetAdapter } from "./baseAdapter";
import { logger } from "../logger";
import type { AdapterCapabilities } from "./types";
import {
  ExternalVehicle,
  ExternalDriver,
  ExternalTrip,
  WebhookEvent,
} from "./types";

// ── Deterministic ID generation ───────────────────────────────────────────

function deterministicId(fleetId: string, type: string, index: number): string {
  // Simple deterministic hash: fleetId prefix + type + index
  const prefix = fleetId.slice(0, 8);
  return `mock-${prefix}-${type}-${String(index).padStart(3, "0")}`;
}

// ── Mock Data Generators ──────────────────────────────────────────────────

const VEHICLE_MAKES = [
  { make: "Toyota", model: "Prius", type: "car_economy" },
  { make: "Toyota", model: "Allion", type: "car_comfort" },
  { make: "Honda", model: "City", type: "car_comfort" },
  { make: "Hyundai", model: "i10", type: "car_compact" },
  { make: "Bajaj", model: "RE", type: "cng" },
  { make: "TVS", model: "Apache", type: "bike_standard" },
  { make: "Honda", model: "CB Shine", type: "bike_basic" },
  { make: "Yamaha", model: "FZ", type: "bike_plus" },
  { make: "Toyota", model: "Premio", type: "car_premium" },
  { make: "Mitsubishi", model: "Pajero", type: "car_xl" },
];

const DRIVER_NAMES = [
  "Rahman Ahmed",
  "Karim Uddin",
  "Hasan Ali",
  "Kamal Hossain",
  "Rafiq Sheikh",
  "Jamal Mia",
  "Nabil Khan",
  "Sakib Hasan",
  "Tanvir Alam",
  "Arif Chowdhury",
];

function generateMockVehicles(fleetId: string): ExternalVehicle[] {
  return VEHICLE_MAKES.map((v, i) => ({
    provider_vehicle_id: deterministicId(fleetId, "veh", i),
    make: v.make,
    model: v.model,
    year: 2020 + (i % 4),
    license_plate: `DHK-${1000 + i}`,
    vehicle_type: v.type,
    color: ["White", "Silver", "Black", "Red", "Blue"][i % 5],
    seats: v.type.startsWith("bike") ? 1 : v.type === "cng" ? 3 : 4,
    is_active: i < 8, // 2 vehicles inactive
    last_location: {
      lat: 23.8103 + (i * 0.001),
      lng: 90.4125 + (i * 0.001),
    },
    metadata: { source: "mock_platform", fleet_id: fleetId },
  }));
}

function generateMockDrivers(fleetId: string): ExternalDriver[] {
  return DRIVER_NAMES.map((name, i) => ({
    provider_driver_id: deterministicId(fleetId, "drv", i),
    name,
    phone: `+88017${String(10000000 + i).slice(0, 8)}`,
    email: `driver${i}@mock.test`,
    rating: 4.0 + (i % 10) * 0.1,
    vehicle_type: VEHICLE_MAKES[i % VEHICLE_MAKES.length].type,
    is_online: i < 5,
    total_trips: 50 + i * 23,
    documents_verified: i < 7,
    metadata: { source: "mock_platform", fleet_id: fleetId },
  }));
}

function generateMockTrips(fleetId: string, since?: string): ExternalTrip[] {
  const baseTime = since ? new Date(since).getTime() : Date.now() - 86400000;
  // Generate 5 deterministic trips
  return Array.from({ length: 5 }, (_, i) => {
    const offset = i * 3600000; // 1 hour apart
    const tripTime = new Date(baseTime + offset);
    const completedTime = new Date(baseTime + offset + 900000); // +15 min
    return {
      provider_trip_id: deterministicId(fleetId, "trip", i),
      provider_driver_id: deterministicId(fleetId, "drv", i % 5),
      provider_vehicle_id: deterministicId(fleetId, "veh", i % 8),
      status: "completed",
      pickup_lat: 23.8103 + (i * 0.005),
      pickup_lng: 90.4125 + (i * 0.005),
      pickup_address: [
        "Bashundhara R/A",
        "Gulshan Avenue",
        "Banani",
        "Dhanmondi",
        "Mirpur",
      ][i],
      dropoff_lat: 23.8200 + (i * 0.003),
      dropoff_lng: 90.4100 + (i * 0.003),
      dropoff_address: [
        "Sadarghat",
        "Old Dhaka",
        "Motijheel",
        "Uttara",
        "Mohammadpur",
      ][i],
      distance_km: 3.5 + i * 1.2,
      duration_minutes: 12 + i * 3,
      fare_amount: (300 + i * 120) * 100, // paisa
      tip_amount: i * 50 * 100,
      commission_amount: (60 + i * 24) * 100,
      currency: "BDT",
      requested_at: tripTime.toISOString(),
      completed_at: completedTime.toISOString(),
      cancelled_at: null,
      cancel_reason: null,
      metadata: { source: "mock_platform", fleet_id: fleetId },
    };
  });
}

// ── MockRidePlatform Adapter ──────────────────────────────────────────────

export class MockRidePlatformAdapter extends BaseFleetAdapter {
  readonly provider = "mock_platform" as never;

  protected async validateCredentials(): Promise<void> {
    // Mock always validates — just check that some config exists
    if (!this.credentials || Object.keys(this.credentials).length === 0) {
      throw new Error("Mock adapter requires at least an empty config object");
    }
  }

  getCapabilities(): AdapterCapabilities {
    return {
      capabilities: ["vehicles", "drivers", "trips", "earnings"],
      supports_webhooks: false,
      supports_incremental: true,
      max_batch_size: 100,
      rate_limit_per_minute: 1000, // unlimited for mock
    };
  }

  protected async fetchVehicles(): Promise<ExternalVehicle[]> {
    // Simulate network delay (50ms)
    await new Promise((r) => setTimeout(r, 50));
    return generateMockVehicles(this.fleetId ?? "unknown-fleet");
  }

  protected async fetchDrivers(): Promise<ExternalDriver[]> {
    await new Promise((r) => setTimeout(r, 50));
    return generateMockDrivers(this.fleetId ?? "unknown-fleet");
  }

  protected async fetchTrips(since?: string): Promise<ExternalTrip[]> {
    await new Promise((r) => setTimeout(r, 50));
    return generateMockTrips(this.fleetId ?? "unknown-fleet", since);
  }

  async syncEarnings(fleetId: string) {
    await new Promise((r) => setTimeout(r, 50));
    // Earnings are derived from trips — return summary
    return {
      success: true,
      records_fetched: 1,
      records_created: 0,
      records_updated: 0,
      records_unchanged: 1,
      records_failed: 0,
      errors: [],
      duration_ms: 50,
    };
  }

  async handleWebhook(event: WebhookEvent): Promise<void> {
    // Mock doesn't support webhooks — just log
    logger.info(`[MockRidePlatform] webhook received: ${event.event_type}`);
  }
}
