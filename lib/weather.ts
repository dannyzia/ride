import { db } from '@/src/db';
import { weatherConditions, surgeCurrent } from '@/src/db/schema';
import { logger } from '@/lib/logger';

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

export async function fetchWeatherForZone(zoneId: string, lat: number, lng: number): Promise<void> {
  if (!OPENWEATHER_API_KEY) {
    logger.warn('[weather] OPENWEATHER_API_KEY not configured — using defaults');
    return;
  }
  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${OPENWEATHER_API_KEY}&units=metric`);
    if (!res.ok) { logger.error('[weather] API error', await res.text()); return; }
    const data = await res.json();
    const condition = data.weather?.[0]?.main ?? 'Clear';
    const temp = data.main?.temp ?? 25;
    const severe = ['Thunderstorm', 'Tornado', 'Hurricane'].includes(condition);
    const surgeOverride = severe ? '1.5' : condition === 'Rain' ? '1.25' : condition === 'Extreme' ? '2.0' : null;

    await db.insert(weatherConditions).values({
      zone_id: zoneId, condition, temperature_celsius: temp.toString(),
      is_severe: severe, surge_multiplier_override: surgeOverride,
    });

    if (surgeOverride && severe) {
      await db.insert(surgeCurrent).values({
        zone_id: zoneId, multiplier: surgeOverride, demand_count: 0, supply_count: 0, updated_at: new Date(),
      }).onConflictDoUpdate({
        target: surgeCurrent.zone_id,
        set: { multiplier: surgeOverride, updated_at: new Date() },
      });
    }
  } catch (e) { logger.error('[weather] fetchWeatherForZone error', e); }
}
