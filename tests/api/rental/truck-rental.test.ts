// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (Phase 3 precedent, tests/api/delivery/delivery.test.ts).
/**
 * Phase 5 — Truck rental request creation (+ rulings 13–16 round-5 fields).
 *
 * Covers the Phase 5 test order:
 * - POST /api/rental/requests accepts category='truck_rental' with cargo fields,
 *   rental_options CSV, scheduled_start_at, duration_hours — asserted to round-trip
 *   into the mocked insert (REAL Zod via the REAL parseJsonBody; only the DB is mocked).
 * - Rejects categories outside the rental_category enum (400).
 * - cargo-less/options-less truck_rental still creates (encouraged, NOT hard-required —
 *   no invented cross-field rule).
 * - requested_vehicle_type accept-list: car_* values rejected on truck_rental;
 *   truck values accepted; car_* accepted on car_rental (new enum surface, ruling 16).
 */
import { POST } from "@/app/api/rental/requests+api";

const mockInsertCalls: { vals: Record<string, unknown> }[] = [];

jest.mock("@/src/db", () => {
  const makeTx = () => ({
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        mockInsertCalls.push({ vals });
        return { returning: async () => [{ id: "req-1" }] };
      },
    }),
  });
  return {
    db: {
      select: () => ({
        from: () => ({
          where: async () => [{ cnt: 0 }],
        }),
      }),
      insert: () => ({
        values: () => ({
          // N6 rate_limits upsert (rental_create:{user_id}) — first write on POST
          onConflictDoUpdate: () => ({
            returning: async () => [{ count: 1 }],
          }),
          returning: async () => [{ id: "generated-uuid" }],
        }),
      }),
      transaction: async (fn: (tx: unknown) => unknown) => fn(makeTx()),
    },
  };
});

jest.mock("@/lib/auth", () => ({
  requireAnyRole:
    () =>
    async () => ({
      supabaseUser: { id: "auth-test" },
      dbUser: { id: "db-user-1", role: "rider" },
    }),
}));

jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: async () => true,
  getConfigInt: async (_key: string, fallback: number) => fallback,
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

function makePost(body: unknown) {
  return new Request("http://localhost/api/rental/requests", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const truckBody = {
  category: "truck_rental",
  pickup_address: "Sector 7, Uttara",
  pickup_lat: 23.8103,
  pickup_lng: 90.4125,
  dropoff_address: "Chittagong Port",
  dropoff_lat: 22.3200,
  dropoff_lng: 91.7400,
  cargo_tags: ["Furniture/Household", "covered"],
  cargo_weight_kg: 1500,
  cargo_volume_m3: 12.5,
  cargo_description: "Household move, 3rd floor",
  rental_options: "Fragile goods, Live animals, Weight > 1 ton",
  requested_vehicle_type: "medium_truck",
  scheduled_start_at: "2026-09-02T04:00:00.000Z",
  duration_hours: 8,
};

describe("Phase 5 — POST /api/rental/requests (truck rental)", () => {
  beforeEach(() => {
    mockInsertCalls.length = 0;
  });

  it("accepts truck_rental and round-trips cargo + rental_options + scheduling into the insert", async () => {
    const res = await POST(makePost(truckBody));
    expect(res.status).toBe(201);

    const requestInsert = mockInsertCalls.find((c) => c.vals.category === "truck_rental");
    expect(requestInsert).toBeDefined();
    expect(requestInsert.vals.cargo_tags).toEqual(["Furniture/Household", "covered"]);
    expect(requestInsert.vals.cargo_weight_kg).toBe(1500);
    expect(requestInsert.vals.cargo_volume_m3).toBe("12.5");
    expect(requestInsert.vals.cargo_description).toBe("Household move, 3rd floor");
    expect(requestInsert.vals.rental_options).toBe("Fragile goods, Live animals, Weight > 1 ton");
    expect(requestInsert.vals.requested_vehicle_type).toBe("medium_truck");
    expect((requestInsert.vals.scheduled_start_at as Date).toISOString()).toBe(
      "2026-09-02T04:00:00.000Z",
    );
    expect(requestInsert.vals.duration_hours).toBe(8);
  });

  it("rejects categories outside the rental_category enum (400, no insert)", async () => {
    const res = await POST(makePost({ ...truckBody, category: "moving_truck" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("validation_error");
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("still creates a cargo-less, options-less truck_rental (encouraged, not required)", async () => {
    const {
      cargo_tags: _cargoTags,
      cargo_weight_kg: _cargoWeightKg,
      cargo_volume_m3: _cargoVolumeM3,
      cargo_description: _cargoDescription,
      rental_options: _rentalOptions,
      ...bare
    } = truckBody;
    const res = await POST(makePost(bare));
    expect(res.status).toBe(201);

    const requestInsert = mockInsertCalls.find((c) => c.vals.category === "truck_rental");
    expect(requestInsert).toBeDefined();
    expect(requestInsert.vals.cargo_tags).toBeUndefined();
    expect(requestInsert.vals.rental_options).toBeNull();
  });

  it("rejects car_* requested_vehicle_type on truck_rental (Zod accept-list)", async () => {
    const res = await POST(
      makePost({ ...truckBody, requested_vehicle_type: "car_compact" }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("validation_error");
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("accepts truck requested_vehicle_type values and car_* on car_rental (ruling 16 surface)", async () => {
    const truckRes = await POST(
      makePost({ ...truckBody, requested_vehicle_type: "trailer" }),
    );
    expect(truckRes.status).toBe(201);
    const truckInsert = mockInsertCalls.find((c) => c.vals.category === "truck_rental");
    expect(truckInsert.vals.requested_vehicle_type).toBe("trailer");

    mockInsertCalls.length = 0;
    const carRes = await POST(
      makePost({ ...truckBody, category: "car_rental", requested_vehicle_type: "car_compact" }),
    );
    expect(carRes.status).toBe(201);
    const carInsert = mockInsertCalls.find((c) => c.vals.category === "car_rental");
    expect(carInsert.vals.requested_vehicle_type).toBe("car_compact");
  });
});
