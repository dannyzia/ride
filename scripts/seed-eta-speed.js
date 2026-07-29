const postgres = require("postgres");
require("dotenv").config({ path: ".env.local" });

async function seed() {
  const client = postgres(process.env.DATABASE_URL, { ssl: "require" });

  const speedTable = {
    bike: { peak: 15, offpeak: 22, night: 28 },
    cng: { peak: 12, offpeak: 18, night: 22 },
    car: { peak: 10, offpeak: 16, night: 20 },
  };

  await client`
    INSERT INTO system_config (key, value, updated_at)
    VALUES ('eta_speed_kmh', ${JSON.stringify(speedTable)}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  `;

  console.log("eta_speed_kmh seeded:", JSON.stringify(speedTable));
  await client.end();
}
seed().catch((e) => { console.error(e); process.exit(1); });
