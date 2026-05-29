import type { FareBreakdown } from '../lib/fareCalc';

export interface AuthHelloMessage {
  type: 'auth:hello';
  access_token: string;
  role: 'driver' | 'rider';
}

export interface HeartbeatMessage {
  type: 'heartbeat';
  lat: number;
  lng: number;
  ts: number;
}

export interface LocationUpdateMessage {
  type: 'location:update';
  lat: number;
  lng: number;
  ts: number;
}

export interface FetchConfirmMessage {
  type: 'fetch:confirm';
  ride_id: string;
}

export interface OfferAcceptMessage {
  type: 'offer:accept';
  ride_id: string;
}

export interface OfferRejectMessage {
  type: 'offer:reject';
  ride_id: string;
}

export interface RideOfferMessage {
  type: 'ride:offer';
  ride_id: string;
  pickup: { address: string; lat: number; lng: number };
  dropoff: { address: string; lat: number; lng: number };
  fare_breakdown: FareBreakdown;
  vehicle_type: string;
  rider_first_name: string;
  distance_km: number;
  expires_in_ms: number;
  expires_at: string;
}

export interface AcceptAlternativeMessage {
  type: 'ride:accept-alternative';
  ride_id: string;
  vehicle_type: string;
}

export type InboundMessage =
  | AuthHelloMessage
  | HeartbeatMessage
  | LocationUpdateMessage
  | FetchConfirmMessage
  | OfferAcceptMessage
  | OfferRejectMessage
  | AcceptAlternativeMessage;

export type OutboundMessage =
  | RideOfferMessage
  | { type: 'offer:expired'; ride_id: string }
  | { type: 'ride:matched'; ride_id: string; driver_id: string; driver_phone: string }
  | { type: 'ride:cancelled'; ride_id: string; reason?: string }
  | { type: 'error'; message: string }
  | { type: 'ride:alternatives'; ride_id: string; alternatives: { vehicle_type: string; fare_breakdown: Record<string, unknown> }[] };
