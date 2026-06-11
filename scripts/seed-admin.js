const { drizzle } = require("drizzle-orm/postgres-js");
const postgres = require("postgres");
require("dotenv").config({ path: ".env.local" });

const SUPABASE_PAT = process.env.SUPABASE_PAT;
const PROJECT_REF = "swzgkhwjvikyfaqnbrix";

async function seedViaApi() {
  if (!SUPABASE_PAT) {
    console.error(
      "SUPABASE_PAT env var required for API fallback. Get it from: https://supabase.com/dashboard/account/tokens",
    );
    process.exit(1);
  }
  const phone = process.env.SEED_ADMIN_PHONE;
  if (!phone) throw new Error("SEED_ADMIN_PHONE env var required");

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `INSERT INTO users (phone, name, role, auth_uid, created_at, updated_at) SELECT '${phone}', 'Admin', 'admin', 'admin-seed-' || gen_random_uuid()::text, now(), now() WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone = '${phone}')`,
      }),
    },
  );
  await res.json();
  console.log("Admin user seeded");
}

async function seed() {
  const phone = process.env.SEED_ADMIN_PHONE;
  if (!phone) throw new Error("SEED_ADMIN_PHONE env var required");

  try {
    const sql = postgres(process.env.DATABASE_URL, {
      connection: { attempts: 1 },
    });
    const db = drizzle(sql);

    const existing = await db.execute(
      `SELECT id FROM users WHERE phone = '${phone}' LIMIT 1`,
    );
    if (existing.length > 0) {
      console.log("Admin user already exists");
      await sql.end();
      return;
    }

    await db.execute(`
      INSERT INTO users (phone, name, role, auth_uid, created_at, updated_at)
      VALUES ('${phone}', 'Admin', 'admin', 'admin-seed-' || gen_random_uuid()::text, now(), now())
      ON CONFLICT (phone) DO UPDATE SET role = 'admin';
    `);
    console.log("Admin user seeded");
    await sql.end();
  } catch (_e) {
    console.log("Direct connection failed, trying Management API...");
    await seedViaApi();
  }
}
seed().catch(console.error);
