/**
 * Generic adapter interface for external fleet integrations.
 *
 * Every external provider (Uber, inDrive, Pathao, etc.) must implement
 * this interface. The sync engine orchestrates adapters through these methods.
 *
 * Identity Rule: External providers NEVER become the primary identity of
 * internal entities. The internal entity owns the mapping.
 *
 * Money fields: integer paisa (BDT) throughout. Convert at the boundary.
 */

// ── External Data Shapes ──────────────────────────────────────────────────

export interface ExternalVehicle {
  provider_vehicle_id: string;
  make: string;
  model: string;
  year: number;
  license_plate: string;
  vehicle_type: string; // provider's classification
  color: string | null;
  seats: number;
  is_active: boolean;
  last_location?: { lat: number; lng: number };
  metadata?: Record<string, unknown>;
}

export interface ExternalDriver {
  provider_driver_id: string;
  name: string;
  phone: string;
  email: string | null;
  rating: number | null;
  vehicle_type: string;
  is_online: boolean;
  total_trips: number;
  documents_verified: boolean;
  metadata?: Record<string, unknown>;
}

export interface ExternalTrip {
  provider_trip_id: string;
  provider_driver_id: string;
  provider_vehicle_id: string | null;
  status: string; // provider's status
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  distance_km: number;
  duration_minutes: number;
  fare_amount: number; // integer paisa in BDT
  tip_amount: number; // integer paisa
  commission_amount: number; // integer paisa
  currency: string;
  requested_at: string; // ISO 8601
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  metadata?: Record<string, unknown>;
}

export interface ExternalEarning {
  period_start: string; // ISO 8601
  period_end: string;
  provider_driver_id: string;
  total_fare_bdt: number; // integer paisa
  total_tip_bdt: number;
  total_commission_bdt: number;
  net_earning_bdt: number;
  trip_count: number;
  online_hours: number;
}

// ── Adapter Capabilities ──────────────────────────────────────────────────

export type SyncCapability = "vehicles" | "drivers" | "trips" | "earnings";

export interface AdapterCapabilities {
  capabilities: SyncCapability[];
  supports_webhooks: boolean;
  supports_incremental: boolean;
  max_batch_size: number;
  rate_limit_per_minute: number;
}

// ── Sync Result ───────────────────────────────────────────────────────────

export interface SyncResult {
  success: boolean;
  records_fetched: number;
  records_created: number;
  records_updated: number;
  records_unchanged: number;
  records_failed: number;
  errors: SyncError[];
  duration_ms: number;
}

export interface SyncError {
  external_id: string;
  error_code: string;
  message: string;
  retryable: boolean;
}

// ── Adapter Error Types ───────────────────────────────────────────────────

export type AdapterErrorType =
  | "authentication_failed" // expired token, invalid credentials
  | "rate_limited" // provider rate limit hit
  | "timeout" // request timed out
  | "network_error" // connection failure
  | "provider_error" // provider's internal error
  | "configuration_error" // bad config / missing fields
  | "permission_denied"; // insufficient scopes

export class AdapterError extends Error {
  constructor(
    public readonly type: AdapterErrorType,
    message: string,
    public readonly retryable: boolean = false,
    public readonly statusCode?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

// ── Webhook ───────────────────────────────────────────────────────────────

export interface WebhookEvent {
  provider: string;
  event_type: string;
  external_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
  signature?: string;
}

// ── The Adapter Interface ─────────────────────────────────────────────────

export interface FleetIntegrationAdapter {
  /** Provider identifier (must match integrationProviderEnum). */
  readonly provider: string;

  /** Connect to the external provider (OAuth flow or API key validation). */
  connect(config: Record<string, unknown>): Promise<void>;

  /** Disconnect and revoke tokens. */
  disconnect(): Promise<void>;

  /** Test the connection — returns true if healthy, throws AdapterError otherwise. */
  testConnection(): Promise<boolean>;

  /** Get the adapter's capabilities. */
  getCapabilities(): AdapterCapabilities;

  /** Sync all vehicles from the external provider. */
  syncVehicles(fleetId: string): Promise<SyncResult>;

  /** Sync all drivers from the external provider. */
  syncDrivers(fleetId: string): Promise<SyncResult>;

  /** Sync trips (initial import or incremental). */
  syncTrips(
    fleetId: string,
    since?: string,
  ): Promise<SyncResult>;

  /** Sync earnings data. */
  syncEarnings(
    fleetId: string,
    since?: string,
  ): Promise<SyncResult>;

  /** Handle an incoming webhook event from the provider. */
  handleWebhook(event: WebhookEvent): Promise<void>;
}
