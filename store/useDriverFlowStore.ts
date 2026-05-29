import { create } from 'zustand';

interface Subscription {
  id: string;
  package_id: string;
  package_name: string;
  calls_remaining: number;
  daily_calls_used: number;
  daily_reset_at: string;
  status: string;
  purchased_at: string;
  expires_at: string;
  is_trial: boolean;
}

interface DriverRow {
  id: string;
  user_id: string;
  vehicle_type: string;
  status: string;
  rating: string;
  is_online: boolean;
  acceptance_rate: string;
  completed_rides_count: number;
  calls_remaining?: number;
  subscription?: Subscription | null;
}

interface RideOffer {
  ride_id: string;
  pickup: { address: string; lat: number; lng: number };
  dropoff: { address: string; lat: number; lng: number };
  fare_breakdown: {
    base_fare_bdt: number;
    distance_charge_bdt: number;
    wait_charge_bdt: number;
    total_bdt: number;
    minimum_fare_bdt: number;
    distance_km: number;
  };
  vehicle_type: string;
  rider_first_name: string;
  distance_km: number;
  expires_in_ms: number;
  expires_at: string;
}

interface DriverFlowState {
  driver: DriverRow | null;
  activeSubscription: Subscription | null;
  isOnline: boolean;
  activeOffer: RideOffer | null;
  fetchDriver: () => Promise<void>;
  fetchSubscription: () => Promise<void>;
  setOnline: (online: boolean) => void;
  setActiveOffer: (offer: RideOffer | null) => void;
}

export const useDriverFlowStore = create<DriverFlowState>((set, _get) => ({
  driver: null,
  activeSubscription: null,
  isOnline: false,
  activeOffer: null,

  fetchDriver: async () => {
    try {
      const res = await fetch('/api/driver/me');
      if (res.ok) {
        const data = await res.json();
        set({ driver: data.driver });
      }
    } catch {
      // Silently fail - component handles null state
    }
  },

  fetchSubscription: async () => {
    try {
      const res = await fetch('/api/package/active');
      if (res.ok) {
        const data = await res.json();
        set({ activeSubscription: data.subscription });
      }
    } catch {
      // Silently fail
    }
  },

  setOnline: (online: boolean) => {
    set({ isOnline: online });
    fetch('/api/driver/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_online: online }),
    }).catch(() => {});
  },

  setActiveOffer: (offer) => set({ activeOffer: offer }),
}));
