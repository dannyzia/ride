const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');

async function seed() {
  const client = postgres(process.env.DATABASE_URL, { ssl: 'require' });
  const db = drizzle(client);
  await db.execute(`
    INSERT INTO system_config (key, value, updated_at) VALUES
      ('dispatch_paused',        'false',  now()),
      ('min_app_version',        '1.0.0',  now()),
      ('brta_fare_ceiling_bdt',  '50000',  now())
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log('system_config seeded');
}
seed().catch(console.error);
