// WebSocket protocol types — synchronized with the actual message handlers in
// utils-server/index.ts (B-8). Inbound = client→server, Outbound = server→client.
// Phantom types (offer:expired, ride:matched as WS, ride:accept-alternative)
// were removed; the real wire names (offer:lost, ride:status, ride:expired)
// are declared here.

import type { FareBreakdown } from "../lib/fareCalc";

export interface AuthHelloMessage {
  type: "auth:hello";
  access_token: string;
  role: "driver" | "rider" | "admin";
}

export interface AuthRefreshMessage {
  type: "auth:refresh";
  access_token: string;
}

export interface HeartbeatMessage {
  type: "heartbeat";
  lat: number;
  lng: number;
  // Client sends an ISO-8601 string; keep the union so both are accepted.
  ts: string | number;
}

export interface LocationUpdateMessage {
  type: "location:update";
  lat: number;
  lng: number;
  ts: string | number;
  ride_id: string;
}

export interface FetchConfirmMessage {
  type: "fetch:confirm";
  ride_id: string;
}

export interface RideArrivedMessage {
  type: "ride:arrived";
  ride_id: string;
  arrived_at?: string;
}

export interface RideStartMessage {
  type: "ride:start";
  ride_id: string;
  pin: string;
}

export interface OfferAcceptMessage {
  type: "offer:accept";
  ride_id: string;
}

export interface OfferRejectMessage {
  type: "offer:reject";
  ride_id: string;
  reason?: string;
}

export interface ChatTypingMessage {
  type: "chat:typing";
  ride_id: string;
}

export interface RideSubscribeMessage {
  type: "ride:subscribe" | "ride:unsubscribe";
  ride_id: string;
}

export type InboundMessage =
  | AuthHelloMessage
  | AuthRefreshMessage
  | HeartbeatMessage
  | LocationUpdateMessage
  | FetchConfirmMessage
  | RideArrivedMessage
  | RideStartMessage
  | OfferAcceptMessage
  | OfferRejectMessage
  | ChatTypingMessage
  | RideSubscribeMessage;

export interface RideOfferMessage {
  type: "ride:offer";
  ride_id: string;
  pickup: { address: string; lat: number; lng: number };
  dropoff: { address: string; lat: number; lng: number };
  fare_breakdown: FareBreakdown;
  /** M-B: amount the driver will earn (fare_breakdown.total_bdt + preference
   *  surcharge) — the offer card MUST display this, not total_bdt. */
  driver_fare_bdt: number;
  vehicle_type: string;
  rider_id: string;
  rider_phone: string;
  rider_first_name: string;
  rider_rating: number | null;
  distance_km: number;
  pickup_distance_km: number;
  pickup_eta_minutes: number;
  is_scheduled: boolean;
  preference_ids: string[];
  expires_in_ms: number;
  expires_at: string;
  upfront_tip_bdt: number;
}

// F-15: SOS alert broadcast to connected admin dashboards. Mirrors a
// sos_alerts row (numeric lat/lng as strings, ISO-8601 created_at).
export interface SosAlertPayload {
  id: string;
  user_id: string;
  role: string;
  latitude: string;
  longitude: string;
  message: string | null;
  ride_id: string | null;
  created_at: string;
}

export type OutboundMessage =
  | { type: "auth:ok"; user_id: string; role: "driver" | "rider" | "admin" }
  | { type: "auth:error"; message: string }
  | { type: "admin:suspended"; message?: string }
  | { type: "error"; message: string }
  | RideOfferMessage
  | { type: "offer:accepted"; ride_id: string }
  | { type: "offer:rejected"; ride_id: string; reason?: string }
  | { type: "offer:lost"; ride_id: string; reason?: string }
  | { type: "fetch:confirmed"; ride_id: string }
  | { type: "fetch:error"; ride_id: string; reason: string }
  | { type: "ride:status"; ride_id: string; status: string; pin?: string; ride?: Record<string, unknown> }
  | { type: "ride:started"; ride_id: string }
  | { type: "ride:start_failed"; ride_id: string; error: string }
  | {
      type: "ride:completed";
      ride_id: string;
      total_bdt: number;
      driver_net_bdt: number;
      ride_time_min: number;
      fare_breakdown: FareBreakdown;
    }
  | { type: "ride:arrived"; ride_id: string }
  | { type: "ride:cancelled"; ride_id: string; cancelled_by?: "rider" | "driver" | "system" }
  | { type: "ride:expired"; ride_id: string }
  | { type: "ride:alternatives"; ride_id: string; alternatives: { vehicle_type: string; fare_breakdown: Record<string, unknown> }[] }
  | { type: "chat:message"; ride_id: string; message: string; sender: string }
  | { type: "chat:typing"; ride_id: string }
  | { type: "location:driver"; ride_id: string; lat: number; lng: number }
  | { type: "admin:sos"; alert: SosAlertPayload };
