// WebSocket protocol types — synchronized with the actual message handlers in
// utils-server/index.ts + rentalHandler/shopHandler/emergencyHandler/
// deliveryHandler (B-8; re-audited 2026-10-16 for B5-4). Inbound =
// client→server, Outbound = server→client. Phantom types (offer:expired,
// ride:matched as WS, ride:accept-alternative) were removed; the real wire
// names (offer:lost, ride:status, ride:expired) are declared here.
// Sync check: utils-server/__tests__/ws-contract-sync.test.ts pins every
// declared domain event against its handler source.

import type { FareBreakdown } from "../lib/fareCalc";

export interface AuthHelloMessage {
  type: "auth:hello";
  access_token: string;
  // B5-4: "shop" added — index.ts auth:hello accepts shop-dashboard
  // sockets (active shop_members row; users.role is NOT consulted).
  role: "driver" | "rider" | "admin" | "shop";
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
  // B5-4: fields the index.ts chat branch actually reads (S-1 participant
  // check runs on recipient_user_id; both are required, else
  // missing_chat_fields).
  recipient_user_id: string;
  is_typing: boolean;
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

// ── Marketplace + emergency domains (B5-4) ─────────────────────────────
// These handlers are S→C notification relays: the server re-emits the event
// names below with the Z2 producer payloads (REST routes / activation jobs /
// chain relays). No delivery:* domain exists anymore (B5-1 retired it —
// do NOT re-declare it).

/** Rental marketplace relay vocabulary (rentalHandler switch). */
export type RentalEvent =
  | "rental:bid_request"
  | "rental:new_bid"
  | "rental:bid_won"
  | "rental:bid_settled"
  | "rental:driver_assigned"
  | "rental:fleet_ack"
  | "rental:status";

export interface RentalRelayMessage {
  type: RentalEvent;
  request_id: string;
  [key: string]: unknown;
}

/** Shop marketplace relay shapes (shopHandler — field-verified 2026-10-16). */
export type ShopRelayMessage =
  | { type: "shop:order_status"; order_id: string; status: string; shop_id: string }
  | { type: "shop:rfq_quote"; rfq_id: string; quoted_price_bdt: number; quoted_notes?: string }
  | { type: "shop:new_rfq"; rfq_id: string; shop_id: string; title: string }
  | { type: "shop:delivery_created"; order_id: string; delivery_request_id: string };

/**
 * Emergency ambulance vocabulary (emergencyHandler inbound + acks, plus the
 * emergencyChain/index.ts relays — field-verified 2026-10-16).
 */
export type EmergencyInboundMessage =
  | { type: "emergency:accept"; request_id: string }
  | { type: "emergency:status"; request_id: string; status: string }
  | { type: "emergency:cancel"; request_id: string; reason?: string };

export type EmergencyRelayMessage =
  | { type: "emergency:accepted"; request_id: string; status: string }
  | { type: "emergency:status_ack"; request_id: string; status: string }
  | { type: "emergency:cancel_ack"; request_id: string }
  | { type: "emergency:status"; request_id: string; status: string; updated_at: string }
  | { type: "emergency:cancel"; request_id: string; reason: string | null }
  | {
      type: "emergency:new_request";
      request_id: string;
      pickup: { address: string; lat: number; lng: number };
      service_level: string;
      requires_paramedic: boolean;
      expires_at: string;
    }
  | { type: "emergency:location"; request_id: string; lat: number; lng: number; ts: string | number | null };

export type OutboundMessage =
  | { type: "auth:ok"; user_id: string; role: "driver" | "rider" | "admin" | "shop" }
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
  // B5-4: relay carries the S-1 verified sender + the typing flag.
  | { type: "chat:typing"; ride_id: string; sender_user_id: string; is_typing: boolean }
  // B5-4: the location:update branch forwards ts + eta_minutes (null when
  // the driver client omits them).
  | { type: "location:driver"; ride_id: string; lat: number; lng: number; ts: string | number | null; eta_minutes: number | null }
  | { type: "admin:sos"; alert: SosAlertPayload }
  | RentalRelayMessage
  | ShopRelayMessage
  | EmergencyRelayMessage;
