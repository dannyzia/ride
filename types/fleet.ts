/**
 * Shared fleet types — API response shapes and client state.
 * Used by both server routes and client stores/components.
 */

// ── Fleet profile ────────────────────────────────────────────────────────

export interface Fleet {
  id: string;
  name: string;
  fleet_type: "NATIVE" | "EXTERNAL" | "HYBRID";
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "BLOCKED" | "CLOSED";
  owner_user_id: string;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

export interface FleetProfileResponse {
  fleet: Fleet;
  my_role: string;
}

// ── Fleet vehicle ────────────────────────────────────────────────────────

export interface FleetVehicle {
  id: string;
  fleet_id: string;
  driver_id: string | null;
  vehicle_type: string;
  manufacturer: string;
  model: string;
  manufacturing_year: number;
  registration_number: string;
  passenger_seats: number;
  has_ac: boolean | null;
  created_at: string;
  // Computed from assignment
  driver_name: string | null;
  is_assigned: boolean;
}

// ── Fleet driver ─────────────────────────────────────────────────────────

export interface FleetDriver {
  id: string;
  fleet_id: string;
  user_id: string;
  name: string;
  phone: string;
  vehicle_type: string;
  vehicle_id: string | null;
  status: string;
  rating: string;
  completed_rides_count: number;
  is_online: boolean;
  created_at: string;
}

// ── Fleet assignment ─────────────────────────────────────────────────────

export interface FleetAssignment {
  id: string;
  fleet_id: string;
  vehicle_id: string;
  driver_id: string;
  assigned_at: string;
  unassigned_at: string | null;
  assigned_by: string | null;
  reason: string | null;
  status: string;
}

// ── Fleet trip (reads from rides table) ──────────────────────────────────

export interface FleetTrip {
  id: string;
  rider_name: string;
  driver_name: string;
  vehicle_type: string;
  origin_address: string;
  destination_address: string;
  distance_km: number | null;
  status: string;
  fare_bdt: number; // integer paisa
  platform_commission_bdt: number | null;
  created_at: string;
  completed_at: string | null;
}

// ── Fleet finance ────────────────────────────────────────────────────────

export interface FleetFinanceSummary {
  today_trips: number;
  today_revenue_bdt: number;
  today_commission_bdt: number;
  week_trips: number;
  week_revenue_bdt: number;
  month_trips: number;
  month_revenue_bdt: number;
}

// ── Fleet alert ──────────────────────────────────────────────────────────

export interface FleetAlert {
  id: string;
  fleet_id: string;
  type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

// ── Fleet dashboard ──────────────────────────────────────────────────────

export interface FleetDashboardData {
  fleet: Fleet;
  vehicles: {
    total: number;
    active: number;
    on_trip: number;
    maintenance: number;
  };
  drivers: {
    total: number;
    online: number;
    on_trip: number;
  };
  today: {
    trips: number;
    revenue_bdt: number;
  };
  alerts: FleetAlert[];
}

// ── Fleet staff ──────────────────────────────────────────────────────────

export interface FleetStaffMember {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  role: string;
  status: string;
  joined_at: string;
}

// ── Fleet subscription ───────────────────────────────────────────────────

export interface FleetSubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  billing_period: "WEEKLY" | "MONTHLY" | "YEARLY";
  price_bdt: number; // integer paisa
  vehicle_limit: number | null;
  driver_limit: number | null;
  api_limit: number | null;
  features: Record<string, unknown> | null;
  active: boolean;
}

export interface FleetSubscription {
  id: string;
  fleet_id: string;
  plan_id: string;
  status: string;
  started_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  plan: FleetSubscriptionPlan | null;
}

// ── Dashboard metrics ────────────────────────────────────────────────────

export interface FleetMetricCard {
  label: string;
  value: string | number;
  icon?: string;
  trend?: "up" | "down" | "flat";
}
