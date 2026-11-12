/**
 * Ensure-before-use location helper (Node launch Stage 3 — hide inventory
 * #19, G6): a location-essential flow calls this immediately before the
 * request that needs a fix, so no such flow depends on a hidden ride screen
 * having hydrated the address first.
 *
 * Chain (reuses the ride home's geocoding path): foreground permission
 * (requesting only when not yet decided) → getCurrentPositionAsync (bounded
 * race, mirroring the ride home's 8 s cap) → Barikoi v2 reverse geocode →
 * useCustomer.setUserLocation (the same store slot the services-hub header
 * displays).
 *
 * Silent-failure contract (same as the ride home): permission denied, GPS
 * timeout, or geocode failure resolves null / a coordinate-pair address and
 * NEVER throws — callers proceed with their own fallback. Callers that need
 * a fix must degrade gracefully (e.g. ambulance keeps its Dhaka default).
 */
import * as Location from "expo-location";
import { getBarikoiReverseGeocodeUrl } from "@/lib/useBarikoiMapStyle";
import { useCustomer } from "@/store";
import { logger } from "@/lib/logger";

export interface EnsuredLocation {
  latitude: number;
  longitude: number;
  address: string;
}

export async function ensureCustomerLocation(
  timeoutMs = 8000,
): Promise<EnsuredLocation | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    let status = perm.status;
    if (status !== "granted") {
      const requested = await Location.requestForegroundPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return null;

    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!loc) return null;

    const latitude = loc.coords.latitude;
    const longitude = loc.coords.longitude;

    let address = "";
    try {
      const res = await fetch(getBarikoiReverseGeocodeUrl(latitude, longitude));
      if (res.ok) {
        const data = await res.json();
        address = data?.place?.address || data?.place?.name || "";
      }
    } catch {
      // Silent-failure contract — the coordinate pair below is the fallback.
    }
    if (!address) address = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

    useCustomer.getState().setUserLocation({ latitude, longitude, address });
    return { latitude, longitude, address };
  } catch (e) {
    logger.warn("[ensureLocation] failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
