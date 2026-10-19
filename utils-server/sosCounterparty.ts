// C3-7 (STAGE C3-FIX): SOS counterparty fan-out message.
//
// Rider SOS → the driver gets a banner; driver SOS → the rider gets a
// safe-exit message. Exactly ONE message to exactly ONE recipient (the ride
// counterparty) — contacts and admin travel their own channels (SMS /
// admin:sos), never batched into this event.

export interface SosCounterpartySource {
  id: string;
  role: string;
  latitude: string;
  longitude: string;
  ride_id: string | null;
}

export interface SosCounterpartyMessage {
  type: "sos:counterparty";
  alert_id: string;
  ride_id: string;
  from_role: "rider" | "driver";
  lat: string;
  lng: string;
}

/**
 * Wire encoding — a fresh literal (field-picked a second time, never
 * spread) so the WS send helpers typed Record<string, unknown> accept it.
 */
export function sosCounterpartyWire(m: SosCounterpartyMessage): Record<string, unknown> {
  return {
    type: m.type,
    alert_id: m.alert_id,
    ride_id: m.ride_id,
    from_role: m.from_role,
    lat: m.lat,
    lng: m.lng,
  };
}

export function buildSosCounterpartyMessage(
  alert: SosCounterpartySource,
): SosCounterpartyMessage | null {
  if (!alert.ride_id) return null;
  if (alert.role !== "rider" && alert.role !== "driver") return null;
  return {
    type: "sos:counterparty",
    alert_id: alert.id,
    ride_id: alert.ride_id,
    from_role: alert.role,
    lat: alert.latitude,
    lng: alert.longitude,
  };
}
