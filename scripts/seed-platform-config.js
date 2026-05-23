const { drizzle } = require('drizzle-orm/neon-serverless');
const { neon } = require('@neondatabase/serverless');

async function seed() {
  const sql = neon(process.env.DATABASE_URL);
  const db  = drizzle(sql);
  await db.execute(`
    INSERT INTO platform_config (key, value, updated_at) VALUES
      ('driver_min_ratio',           '0.70',  now()),
      ('driver_max_ratio',           '1.50',  now()),
      ('brta_max_base_bdt',          '8500',  now()),
      ('brta_max_per_km_bdt',        '3400',  now()),
      ('brta_max_wait_per_2min_bdt', '850',   now())
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log('platform_config seeded (5 keys)');
}
seed().catch(console.error);
