import { create } from 'zustand';
import { API_URL } from '@/lib/config';
import { supabase } from '@/lib/supabase';

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
  on_break: boolean;
  break_started_at: string | null;
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
  // M-B: amount the driver will earn (total + preference surcharge) — the
  // offer card shows this, NOT fare_breakdown.total_bdt. Null when the server
  // predates the field.
  driver_fare_bdt: number | null;
  vehicle_type: string;
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

interface DriverFlowState {
  driver: DriverRow | null;
  activeSubscription: Subscription | null;
  isOnline: boolean;
  activeOffer: RideOffer | null;
  fetchDriver: () => Promise<void>;
  fetchSubscription: () => Promise<void>;
  setOnline: (online: boolean) => void;
  setActiveOffer: (offer: RideOffer | null) => void;
  reset: () => void;
}

export const useDriverFlowStore = create<DriverFlowState>((set, _get) => ({
  driver: null,
  activeSubscription: null,
  isOnline: false,
  activeOffer: null,

  fetchDriver: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/driver/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/package/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        await fetch(`${API_URL}/api/driver/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ is_online: online }),
        });
      } catch {
        // Silently fail
      }
    })();
  },

  setActiveOffer: (offer) => set({ activeOffer: offer }),

  reset: () => set({ driver: null, activeSubscription: null, isOnline: false, activeOffer: null }),
}));
