const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
require("dotenv").config({ path: ".env.local" });

const packages = [
  {
    name: "Free Trial",
    call_count: 5,
    duration_days: 7,
    price_bdt: 0,
    is_trial: true,
    daily_cap: 5,
  },
  {
    name: "Starter 50",
    call_count: 50,
    duration_days: 30,
    price_bdt: 30000,
    is_trial: false,
    daily_cap: 50,
  },
  {
    name: "Pro 200",
    call_count: 200,
    duration_days: 30,
    price_bdt: 80000,
    is_trial: false,
    daily_cap: 200,
  },
  {
    name: "Unlimited",
    call_count: -1,
    duration_days: 30,
    price_bdt: 150000,
    is_trial: false,
    daily_cap: 200,
  },
];

async function seed() {
  const client = postgres(process.env.DATABASE_URL, { ssl: "require" });
  const db = drizzle(client);
  for (const pkg of packages) {
    await db.execute(`
      INSERT INTO packages (name, call_count, duration_days, price_bdt, is_trial, daily_cap, created_at, updated_at)
      VALUES ('${pkg.name}', ${pkg.call_count}, ${pkg.duration_days}, ${pkg.price_bdt}, ${pkg.is_trial}, ${pkg.daily_cap}, now(), now())
      ON CONFLICT DO NOTHING;
    `);
  }
  console.log("packages seeded");
  await client.end();
}
seed().catch(console.error);
