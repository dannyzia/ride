export type VehicleGroup = "bike" | "cng" | "car";
export type TimeBucket = "peak" | "offpeak" | "night";

export interface EtaSpeedTable {
  bike: { peak: number; offpeak: number; night: number };
  cng: { peak: number; offpeak: number; night: number };
  car: { peak: number; offpeak: number; night: number };
}

export const DEFAULT_SPEED_TABLE: EtaSpeedTable = {
  bike: { peak: 15, offpeak: 22, night: 28 },
  cng: { peak: 12, offpeak: 18, night: 22 },
  car: { peak: 10, offpeak: 16, night: 20 },
};

export function vehicleGroup(vehicleType: string): VehicleGroup {
  if (vehicleType.startsWith("bike_")) return "bike";
  if (vehicleType === "cng") return "cng";
  return "car";
}

export function timeBucket(date: Date): TimeBucket {
  const dhakaHour = (date.getUTCHours() + 6) % 24;

  if ((dhakaHour >= 7 && dhakaHour < 10) || (dhakaHour >= 17 && dhakaHour < 21)) {
    return "peak";
  }
  if (dhakaHour >= 23 || dhakaHour < 7) {
    return "night";
  }
  return "offpeak";
}

export function etaSpeedKmh(
  vehicleType: string,
  bucket: TimeBucket,
  table: EtaSpeedTable = DEFAULT_SPEED_TABLE,
): number {
  const group = vehicleGroup(vehicleType);
  return table[group][bucket];
}

export function computeEtaMinutes(distanceKm: number, speedKmh: number): number {
  if (speedKmh <= 0 || distanceKm <= 0) return 1;
  return Math.max(1, Math.round((distanceKm / speedKmh) * 60));
}

export async function loadSpeedTableFromConfig(
  loader: (key: string) => Promise<string | null>,
): Promise<EtaSpeedTable> {
  const raw = await loader("eta_speed_kmh");
  if (!raw) return DEFAULT_SPEED_TABLE;
  try {
    const parsed = JSON.parse(raw);
    return {
      bike: { ...DEFAULT_SPEED_TABLE.bike, ...parsed.bike },
      cng: { ...DEFAULT_SPEED_TABLE.cng, ...parsed.cng },
      car: { ...DEFAULT_SPEED_TABLE.car, ...parsed.car },
    };
  } catch {
    return DEFAULT_SPEED_TABLE;
  }
}
