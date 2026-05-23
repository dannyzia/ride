const { drizzle } = require('drizzle-orm/neon-serverless');
const { neon } = require('@neondatabase/serverless');

async function seed() {
  const phone = process.env.SEED_ADMIN_PHONE;
  if (!phone) throw new Error('SEED_ADMIN_PHONE env var required');

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  // Check if admin already exists
  const existing = await db.execute(`SELECT id FROM users WHERE phone = '${phone}' LIMIT 1`);
  if (existing.length > 0) {
    console.log('Admin user already exists');
    return;
  }

  await db.execute(`
    INSERT INTO users (phone, name, role, firebase_uid, created_at, updated_at)
    VALUES ('${phone}', 'Admin', 'admin', 'admin-seed-' || gen_random_uuid()::text, now(), now())
    ON CONFLICT (phone) DO UPDATE SET role = 'admin';
  `);
  console.log('Admin user seeded');
}
seed().catch(console.error);
