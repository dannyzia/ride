const { drizzle } = require('drizzle-orm/neon-serverless');
const { neon } = require('@neondatabase/serverless');

const PRICING = [
  { vehicle_type: 'bike_basic',    base_fare_bdt: 2000, per_km_bdt:  900, per_min_wait_bdt:  50, free_wait_minutes: 2, minimum_fare_bdt:  6000 },
  { vehicle_type: 'bike_standard', base_fare_bdt: 2400, per_km_bdt: 1050, per_min_wait_bdt:  50, free_wait_minutes: 2, minimum_fare_bdt:  7000 },
  { vehicle_type: 'bike_plus',     base_fare_bdt: 2800, per_km_bdt: 1250, per_min_wait_bdt:  50, free_wait_minutes: 2, minimum_fare_bdt:  8000 },
  { vehicle_type: 'cng',           base_fare_bdt: 4000, per_km_bdt: 1200, per_min_wait_bdt: 200, free_wait_minutes: 1, minimum_fare_bdt:  8000 },
  { vehicle_type: 'car_economy',   base_fare_bdt: 3500, per_km_bdt: 1300, per_min_wait_bdt: 250, free_wait_minutes: 2, minimum_fare_bdt: 15000 },
  { vehicle_type: 'car_comfort',   base_fare_bdt: 4000, per_km_bdt: 1600, per_min_wait_bdt: 300, free_wait_minutes: 2, minimum_fare_bdt: 18000 },
  { vehicle_type: 'car_premium',   base_fare_bdt: 5000, per_km_bdt: 1900, per_min_wait_bdt: 300, free_wait_minutes: 2, minimum_fare_bdt: 25000 },
  { vehicle_type: 'car_xl',        base_fare_bdt: 7000, per_km_bdt: 2200, per_min_wait_bdt: 350, free_wait_minutes: 2, minimum_fare_bdt: 30000 },
];

async function seed() {
  const zoneId = process.env.ACTIVE_ZONE_ID;
  if (!zoneId) throw new Error('ACTIVE_ZONE_ID env var required');
  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);
  for (const row of PRICING) {
    await db.execute(`
      INSERT INTO pricing
        (zone_id, vehicle_type, base_fare_bdt, per_km_bdt, per_min_wait_bdt,
         free_wait_minutes, minimum_fare_bdt, is_active, created_at, updated_at)
      VALUES
        ('${zoneId}', '${row.vehicle_type}', ${row.base_fare_bdt}, ${row.per_km_bdt},
         ${row.per_min_wait_bdt}, ${row.free_wait_minutes}, ${row.minimum_fare_bdt},
         true, now(), now())
      ON CONFLICT (zone_id, vehicle_type) WHERE is_active = true
      DO UPDATE SET
        base_fare_bdt    = EXCLUDED.base_fare_bdt,
        per_km_bdt       = EXCLUDED.per_km_bdt,
        per_min_wait_bdt = EXCLUDED.per_min_wait_bdt,
        free_wait_minutes= EXCLUDED.free_wait_minutes,
        minimum_fare_bdt = EXCLUDED.minimum_fare_bdt,
        updated_at       = now();
    `);
  }
  console.log('pricing seeded (8 vehicle types)');
}
seed().catch(console.error);
