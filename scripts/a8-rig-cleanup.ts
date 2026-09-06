/**
 * A8 rig cleanup — remove synthetic rows tagged with a rig run tag.
 * Usage: npx tsx --require ./scripts/a8-rig-preload.cjs scripts/a8-rig-cleanup.ts ["A8-RIG-%"]
 */
import * as fs from "node:fs";
import * as path from "node:path";

function loadEnv(): void {
  if (process.env.DATABASE_URL) return;
  for (const file of [".env.local", "utils-server/.env"]) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/);
      if (m) {
        process.env.DATABASE_URL = m[1].trim();
        return;
      }
    }
  }
}

async function main(): Promise<void> {
  loadEnv();
  const { db } = await import("../src/db/index.ts");
  const { rentalRequests, deliveryRequests, emergencyRequests, rentalBids } = await import(
    "../src/db/schema.ts"
  );
  const { like, inArray } = await import("drizzle-orm");

  const pattern = process.argv[2] ?? "A8-RIG-%";

  const matchingRequests = db
    .select({ id: rentalRequests.id })
    .from(rentalRequests)
    .where(like(rentalRequests.pickup_address, pattern));

  // Bids first (FK), via subquery — a literal IN list blows the stack at
  // ~2k ids.
  await db.delete(rentalBids).where(inArray(rentalBids.request_id, matchingRequests));
  await db.delete(rentalRequests).where(like(rentalRequests.pickup_address, pattern));
  await db.delete(deliveryRequests).where(like(deliveryRequests.pickup_address, pattern));
  await db
    .delete(emergencyRequests)
    .where(like(emergencyRequests.patient_condition, pattern));

  console.log(`[a8-rig-cleanup] synthetic rows removed for pattern ${pattern}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[a8-rig-cleanup] FAILED:", e);
    process.exit(1);
  });
