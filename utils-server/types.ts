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

export interface RedispatchResponseMessage {
  type: "ride:redispatch_response";
  ride_id: string;
  keep_looking: boolean; // true = continue searching, false = cancel
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
  | RideSubscribeMessage
  | RedispatchResponseMessage;

export interface RideOfferMessage {
  type: "ride:offer";
  ride_id: string;
  pickup: { address: string; lat: number; lng: number };
  /**
   * Phase D / Stage 2 destination-reveal rule: pre-accept the driver sees
   * ONLY the drop ZONE + coarse heat tag. The exact dropoff address/coords
   * are revealed post-accept via `offer:accepted` / `ride:status` matched.
   */
  dropoff_zone: {
    zone_id: string | null;
    zone_name: string | null;
    heat_tag: "hot" | "neutral" | "cold";
  };
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
  /** §6 lead economics: this offer costs exactly 1 call, debited at send. */
  lead_cost_calls: 1;
  /** Call balance after the offer-time debit (-1 = unlimited sentinel). */
  balance_after_calls: number;
  /** This driver's own pickup compensation estimate (integer paisa,
   *  haversine×1.4, no route call; 0 when pickup fee is disabled). */
  pickup_fee_estimate_bdt: number;
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
  /**
   * Phase D: exact dropoff reveal is POST-ACCEPT only (Stage 2). The PIN is
   * NOT sent to the driver — verbal handoff from the rider.
   */
  | { type: "offer:accepted"; ride_id: string; dropoff: { address: string; lat: number; lng: number } }
  | { type: "offer:rejected"; ride_id: string; reason?: string }
  /**
   * Phase D: sequential-chain terminal notification for the driver whose
   * offer ended without a match. The lead stays billed in every case.
   */
  | { type: "offer:lost"; ride_id: string; reason: "expired" | "cancelled" | "accepted_elsewhere" }
  /**
   * §6 lead economics: emitted to the driver immediately after the offer-time
   * debit (1 call). balance_after_calls = -1 for unlimited packages.
   */
  | { type: "lead:billed"; ride_id: string; balance_after_calls: number }
  | { type: "fetch:confirmed"; ride_id: string }
  | { type: "fetch:error"; ride_id: string; reason: string }
  | { type: "ride:status"; ride_id: string; status: string; pin?: string; dropoff?: { address: string; lat: number; lng: number }; ride?: Record<string, unknown>; pickup_fee_firm_bdt?: number }
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
