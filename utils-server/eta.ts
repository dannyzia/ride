import {
  type EtaSpeedTable,
  DEFAULT_SPEED_TABLE,
  timeBucket,
  etaSpeedKmh,
  computeEtaMinutes,
  loadSpeedTableFromConfig,
} from "../lib/eta";

let cachedTable: EtaSpeedTable | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getCachedSpeedTable(): Promise<EtaSpeedTable> {
  if (cachedTable && Date.now() < cacheExpiry) return cachedTable;

  const { db } = await import("../src/db");
  const { systemConfig } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  const table = await loadSpeedTableFromConfig(async (key) => {
    const [row] = await db
      .select({ value: systemConfig.value })
      .from(systemConfig)
      .where(eq(systemConfig.key, key))
      .limit(1);
    return row?.value ?? null;
  });

  cachedTable = table;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return table;
}

export async function estimateEtaMinutes(
  distanceKm: number,
  vehicleType: string,
  date: Date = new Date(),
): Promise<number> {
  const table = await getCachedSpeedTable();
  const bucket = timeBucket(date);
  const speed = etaSpeedKmh(vehicleType, bucket, table);
  return computeEtaMinutes(distanceKm, speed);
}

export { timeBucket, vehicleGroup, etaSpeedKmh, computeEtaMinutes } from "../lib/eta";
