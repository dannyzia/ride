import { create } from 'zustand';

export interface ActiveOffer {
  ride_id: string;
  pickup: { lat: number; lng: number; address: string };
  dropoff: { lat: number; lng: number; address: string };
  fare_breakdown: Record<string, unknown>;
  vehicle_type: string;
  rider_first_name: string;
  distance_km: number;
  expires_at: string;
}

export interface DriverState {
  driver: {
    id: string;
    name: string;
    phone: string;
    vehicle_type: string;
    status: string;
    is_online: boolean;
    rating: number;
    acceptance_rate: number;
    completed_rides_count: number;
    min_per_km_bdt: number | null;
    // S8 §4.4: GET /api/driver/me spreads the full drivers row, so these
    // arrive at runtime. Optional (older cached shapes lack them) — the
    // driver-home banner reads the toggle GET (server state) instead.
    gender?: string;
    gender_verified?: boolean;
    women_only_enabled?: boolean;
  } | null;
  activeSubscription: {
    id: string;
    // C10-1 grant-source identity (e.g. 'launch_free') — served by GET /api/package/active.
    package_code?: string | null;
    calls_remaining: number;
    daily_calls_used: number;
    daily_reset_at: string;
    status: string;
    expires_at: string;
    is_trial: boolean;
  } | null;
  isOnline: boolean;
  activeOffer: ActiveOffer | null;
  currentRideId: string | null;
  wsConnected: boolean;
  // Session recovery fields (for zombie session detection)
  sessionId: string | null;
  onBreak: boolean;
  breakStartedAt: string | null;
  setDriver: (driver: DriverState['driver']) => void;
  setActiveSubscription: (sub: DriverState['activeSubscription']) => void;
  setIsOnline: (online: boolean) => void;
  setActiveOffer: (offer: ActiveOffer | null) => void;
  setCurrentRideId: (id: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  setSessionId: (id: string | null) => void;
  setOnBreak: (onBreak: boolean, startedAt?: string | null) => void;
  /** Clear ephemeral session state (keep driver profile + subscription) */
  clearSession: () => void;
  reset: () => void;
}

const initialState = {
  driver: null,
  activeSubscription: null,
  isOnline: false,
  activeOffer: null,
  currentRideId: null,
  wsConnected: false,
  sessionId: null,
  onBreak: false,
  breakStartedAt: null,
};

export const useDriverStore = create<DriverState>((set) => ({
  ...initialState,

  setDriver: (driver) => set({ driver }),
  setActiveSubscription: (activeSubscription) => set({ activeSubscription }),
  setIsOnline: (isOnline) => set({ isOnline }),
  setActiveOffer: (activeOffer) => set({ activeOffer }),
  setCurrentRideId: (currentRideId) => set({ currentRideId }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setSessionId: (sessionId) => set({ sessionId }),
  setOnBreak: (onBreak, breakStartedAt) =>
    set({ onBreak, breakStartedAt: breakStartedAt ?? null }),
  clearSession: () =>
    set({
      isOnline: false,
      activeOffer: null,
      currentRideId: null,
      wsConnected: false,
      sessionId: null,
      onBreak: false,
      breakStartedAt: null,
    }),
  reset: () => set(initialState),
}));
