import { create } from 'zustand';
import Constants from 'expo-constants';

export type VehicleType = 'bike_basic' | 'bike_standard' | 'bike_plus' | 'cng' | 'car_economy' | 'car_comfort' | 'car_premium' | 'car_xl';

export interface FareEstimate {
  vehicle_type: VehicleType;
  display_en: string;
  display_bn: string;
  seats: number;
  base_fare_bdt: number;
  distance_charge_bdt: number;
  total_bdt: number;
  distance_km: number;
  eta_minutes: number;
}

export interface ActiveRide {
  id: string;
  status: string;
  driver_id: string | null;
  driver?: {
    name: string;
    phone: string;
    vehicle_type: string;
    rating: number;
  } | null;
  origin_address: string;
  destination_address: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  vehicle_type: string;
  fare_breakdown: Record<string, unknown>;
  distance_km: number;
  eta_minutes?: number;
  created_at: string;
  matched_at?: string;
  started_at?: string;
  driver_lat?: number;
  driver_lng?: number;
}

interface RiderState {
  selectedVehicleType: VehicleType | null;
  estimates: FareEstimate[];
  estimating: boolean;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  activeRide: ActiveRide | null;
  searchingRideId: string | null;
  rideStatus: 'idle' | 'finding' | 'matched' | 'arriving' | 'in_progress' | 'completed' | 'cancelled' | 'expired';
  setSelectedVehicleType: (vt: VehicleType | null) => void;
  setEstimates: (estimates: FareEstimate[]) => void;
  setEstimating: (v: boolean) => void;
  setPickup: (addr: string, lat: number, lng: number) => void;
  setDropoff: (addr: string, lat: number, lng: number) => void;
  clearRoute: () => void;
  setActiveRide: (ride: ActiveRide | null) => void;
  setSearchingRideId: (id: string | null) => void;
  setRideStatus: (status: RiderState['rideStatus']) => void;
  updateDriverLocation: (lat: number, lng: number) => void;
  fetchActiveRide: (token: string) => Promise<void>;
}

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL ?? '';

export const useRiderStore = create<RiderState>((set, get) => ({
  selectedVehicleType: null,
  estimates: [],
  estimating: false,
  pickupAddress: '',
  dropoffAddress: '',
  pickupLat: null,
  pickupLng: null,
  dropoffLat: null,
  dropoffLng: null,
  activeRide: null,
  searchingRideId: null,
  rideStatus: 'idle',

  setSelectedVehicleType: (vt) => set({ selectedVehicleType: vt }),
  setEstimates: (estimates) => set({ estimates }),
  setEstimating: (v) => set({ estimating: v }),
  setPickup: (addr, lat, lng) => set({ pickupAddress: addr, pickupLat: lat, pickupLng: lng }),
  setDropoff: (addr, lat, lng) => set({ dropoffAddress: addr, dropoffLat: lat, dropoffLng: lng }),
  clearRoute: () => set({
    selectedVehicleType: null,
    estimates: [],
    pickupAddress: '',
    dropoffAddress: '',
    pickupLat: null,
    pickupLng: null,
    dropoffLat: null,
    dropoffLng: null,
  }),
  setActiveRide: (ride) => set({ activeRide: ride }),
  setSearchingRideId: (id) => set({ searchingRideId: id }),
  setRideStatus: (status) => set({ rideStatus: status }),
  updateDriverLocation: (lat, lng) => {
    const ride = get().activeRide;
    if (ride) set({ activeRide: { ...ride, driver_lat: lat, driver_lng: lng } });
  },

  fetchActiveRide: async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/rider/ride/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { set({ activeRide: null, rideStatus: 'idle' }); return; }
      const data = await res.json();
      if (data.ride) {
        set({ activeRide: data.ride, rideStatus: mapStatus(data.ride.status) });
      } else {
        set({ activeRide: null, rideStatus: 'idle' });
      }
    } catch {
      set({ activeRide: null, rideStatus: 'idle' });
    }
  },
}));

function mapStatus(dbStatus: string): RiderState['rideStatus'] {
  switch (dbStatus) {
    case 'pending':
    case 'dispatching':
      return 'finding';
    case 'matched':
    case 'driver_arriving':
      return 'arriving';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
    case 'no_drivers':
      return 'expired';
    default:
      return 'idle';
  }
}
