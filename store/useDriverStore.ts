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
  } | null;
  activeSubscription: {
    id: string;
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
  setDriver: (driver: DriverState['driver']) => void;
  setActiveSubscription: (sub: DriverState['activeSubscription']) => void;
  setIsOnline: (online: boolean) => void;
  setActiveOffer: (offer: ActiveOffer | null) => void;
  setCurrentRideId: (id: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  reset: () => void;
}

const initialState = {
  driver: null,
  activeSubscription: null,
  isOnline: false,
  activeOffer: null,
  currentRideId: null,
  wsConnected: false,
};

export const useDriverStore = create<DriverState>((set) => ({
  ...initialState,

  setDriver: (driver) => set({ driver }),
  setActiveSubscription: (activeSubscription) => set({ activeSubscription }),
  setIsOnline: (isOnline) => set({ isOnline }),
  setActiveOffer: (activeOffer) => set({ activeOffer }),
  setCurrentRideId: (currentRideId) => set({ currentRideId }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  reset: () => set(initialState),
}));
