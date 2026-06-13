const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
require("dotenv").config({ path: ".env.local" });

// Fare system v2 seed values
const PRICING = [
  {
    vehicle_type: "bike_basic",
    base_fare_bdt: 2500,
    per_km_bdt: 775,
    intercity_per_km_bdt: 1160,
    per_min_bdt: 175,
    floor_length_km: 2.0,
    floor_min: 10,
  },
  {
    vehicle_type: "bike_standard",
    base_fare_bdt: 2500,
    per_km_bdt: 950,
    intercity_per_km_bdt: 1425,
    per_min_bdt: 180,
    floor_length_km: 2.0,
    floor_min: 10,
  },
  {
    vehicle_type: "bike_plus",
    base_fare_bdt: 2500,
    per_km_bdt: 1050,
    intercity_per_km_bdt: 1575,
    per_min_bdt: 190,
    floor_length_km: 2.0,
    floor_min: 10,
  },
  {
    vehicle_type: "cng",
    base_fare_bdt: 4000,
    per_km_bdt: 1500,
    intercity_per_km_bdt: 2250,
    per_min_bdt: 200,
    floor_length_km: 3.0,
    floor_min: 15,
  },
  {
    vehicle_type: "car_economy",
    base_fare_bdt: 4500,
    per_km_bdt: 1500,
    intercity_per_km_bdt: 2250,
    per_min_bdt: 350,
    floor_length_km: 4.0,
    floor_min: 20,
  },
  {
    vehicle_type: "car_comfort",
    base_fare_bdt: 5000,
    per_km_bdt: 1800,
    intercity_per_km_bdt: 2700,
    per_min_bdt: 375,
    floor_length_km: 4.0,
    floor_min: 20,
  },
  {
    vehicle_type: "car_premium",
    base_fare_bdt: 6500,
    per_km_bdt: 2100,
    intercity_per_km_bdt: 3150,
    per_min_bdt: 400,
    floor_length_km: 4.0,
    floor_min: 20,
  },
  {
    vehicle_type: "car_xl",
    base_fare_bdt: 8000,
    per_km_bdt: 2500,
    intercity_per_km_bdt: 3750,
    per_min_bdt: 425,
    floor_length_km: 4.0,
    floor_min: 20,
  },
];

async function seed() {
  const zoneId = process.env.ACTIVE_ZONE_ID;
  if (!zoneId) throw new Error("ACTIVE_ZONE_ID env var required");
  const client = postgres(process.env.DATABASE_URL, { ssl: "require" });
  const db = drizzle(client);
  for (const row of PRICING) {
    await db.execute(`
      INSERT INTO pricing
        (zone_id, vehicle_type, base_fare_bdt, per_km_bdt, intercity_per_km_bdt, per_min_bdt,
         floor_length_km, floor_min, is_active, created_at, updated_at)
      VALUES
        ('${zoneId}', '${row.vehicle_type}', ${row.base_fare_bdt}, ${row.per_km_bdt},
         ${row.intercity_per_km_bdt}, ${row.per_min_bdt},
         ${row.floor_length_km}, ${row.floor_min},
         true, now(), now())
      ON CONFLICT (zone_id, vehicle_type) WHERE is_active = true
      DO UPDATE SET
        base_fare_bdt         = EXCLUDED.base_fare_bdt,
        per_km_bdt            = EXCLUDED.per_km_bdt,
        intercity_per_km_bdt  = EXCLUDED.intercity_per_km_bdt,
        per_min_bdt           = EXCLUDED.per_min_bdt,
        floor_length_km       = EXCLUDED.floor_length_km,
        floor_min             = EXCLUDED.floor_min,
        updated_at            = now();
    `);
  }
  console.log("pricing seeded (8 vehicle types, fare system v2)");
  await client.end();
}
seed().catch(console.error);
