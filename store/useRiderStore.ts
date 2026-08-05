import { create } from "zustand";
import { API_URL } from "@/lib/config";

export type VehicleType =
  | "bike_basic"
  | "bike_standard"
  | "bike_plus"
  | "cng"
  | "car_economy"
  | "car_comfort"
  | "car_premium"
  | "car_xl";

export type DiscountType = "intro" | "promo" | "pass" | "wallet" | "none";

export interface DiscountOption {
  type: "intro" | "promo" | "pass" | "wallet";
  percent?: number;
  amount_bdt: number;
  description: string;
}

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
  available_discounts?: DiscountOption[];
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
  rideStatus:
    | "idle"
    | "finding"
    | "matched"
    | "arriving"
    | "in_progress"
    | "completed"
    | "cancelled"
    | "expired";
  scheduledAt: string | null;
  promoCode: string | null;
  promoDiscountBdt: number;
  selectedPrefIds: string[];
  scheduledRides: ScheduledRide[];
  completedRides: CompletedRide[];
  paymentMethods: PaymentMethod[];
  recentReceipts: Receipt[];
  walletBalance: number | null;
  transactionHistory: Transaction[];
  name: string | null;
  photo: string | null;
  appliedPromo: { code: string; description: string; discount_bdt: number } | null;
  pickupCoords: { lat: number; lng: number } | null;
  dropoffCoords: { lat: number; lng: number } | null;
  selectedDiscount: { type: DiscountType; amount_bdt: number } | null;
  stops: { lat: number; lng: number; address: string }[];
  setSelectedVehicleType: (vt: VehicleType | null) => void;
  setEstimates: (estimates: FareEstimate[]) => void;
  setEstimating: (v: boolean) => void;
  setPickup: (addr: string, lat: number, lng: number) => void;
  setDropoff: (addr: string, lat: number, lng: number) => void;
  clearRoute: () => void;
  setActiveRide: (ride: ActiveRide | null) => void;
  patchActiveRide: (patch: Partial<ActiveRide>) => void;
  setSearchingRideId: (id: string | null) => void;
  setRideStatus: (status: RiderState["rideStatus"]) => void;
  setScheduledAt: (iso: string | null) => void;
  setPromoCode: (code: string | null) => void;
  setPromoDiscount: (bdt: number) => void;
  setSelectedPrefIds: (ids: string[]) => void;
  updateDriverLocation: (lat: number, lng: number) => void;
  fetchActiveRide: (token: string) => Promise<void>;
  fetchRideHistory: (token: string) => Promise<void>;
  setRider: (patch: Partial<Pick<RiderState, "name" | "photo">>) => void;
  setScheduledRides: (rides: ScheduledRide[]) => void;
  setCompletedRides: (rides: CompletedRide[]) => void;
  setPaymentMethods: (methods: PaymentMethod[]) => void;
  applyPromo: (promo: unknown) => void;
  setRecentReceipts: (receipts: Receipt[]) => void;
  setWalletBalance: (balance: number | null) => void;
  setTransactionHistory: (history: Transaction[]) => void;
  setAppliedPromo: (promo: { code: string; description: string; discount_bdt: number } | null) => void;
  setPickupCoords: (coords: { lat: number; lng: number } | null) => void;
  setDropoffCoords: (coords: { lat: number; lng: number } | null) => void;
  setSelectedDiscount: (discount: { type: DiscountType; amount_bdt: number } | null) => void;
  setStops: (stops: { lat: number; lng: number; address: string }[]) => void;
}

export interface ScheduledRide {
  id: string;
  vehicle_type?: string;
  date?: string;
  time?: string;
  pickup_address?: string;
  destination_address?: string;
  fare_bdt?: number;
}

export interface CompletedRide {
  id: string;
  vehicle_type?: string;
  date?: string;
  time?: string;
  pickup_address?: string;
  destination_address?: string;
  fare_bdt?: number;
}

export interface PaymentMethod {
  type: "card" | "bank";
  label?: string;
  last_four?: string;
  is_default?: boolean;
}

export interface Receipt {
  vehicle_type: string;
  date: string;
  time: string;
  pickup_address: string;
  destination_address: string;
  fare_bdt: number;
}

export interface Transaction {
  type: "credit" | "debit";
  description: string;
  amount_bdt: number;
}

// ── In-memory estimate cache (5-min TTL) ────────────────────────────────
let estimateCache: {
  key: string;
  estimates: FareEstimate[];
  expiry: number;
} | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
): string {
  return `${pickupLat.toFixed(4)}${pickupLng.toFixed(4)}->${dropoffLat.toFixed(4)}${dropoffLng.toFixed(4)}`;
}

export function getCachedEstimates(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
): FareEstimate[] | null {
  if (!estimateCache || Date.now() > estimateCache.expiry) {
    estimateCache = null;
    return null;
  }
  const k = cacheKey(pickupLat, pickupLng, dropoffLat, dropoffLng);
  return estimateCache.key === k ? estimateCache.estimates : null;
}

export function setCachedEstimates(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
  estimates: FareEstimate[],
): void {
  estimateCache = {
    key: cacheKey(pickupLat, pickupLng, dropoffLat, dropoffLng),
    estimates,
    expiry: Date.now() + CACHE_TTL_MS,
  };
}

export const useRiderStore = create<RiderState>((set, get) => ({
  selectedVehicleType: null,
  estimates: [],
  estimating: false,
  pickupAddress: "",
  dropoffAddress: "",
  pickupLat: null,
  pickupLng: null,
  dropoffLat: null,
  dropoffLng: null,
  activeRide: null,
  searchingRideId: null,
  rideStatus: "idle",
  scheduledAt: null,
  promoCode: null,
  promoDiscountBdt: 0,
  selectedPrefIds: [],
  scheduledRides: [],
  completedRides: [],
  paymentMethods: [],
  recentReceipts: [],
  walletBalance: null,
  transactionHistory: [],
  name: null,
  photo: null,
  appliedPromo: null,
  pickupCoords: null,
  dropoffCoords: null,
  selectedDiscount: null,
  stops: [],

  setSelectedVehicleType: (vt) => set({ selectedVehicleType: vt }),
  setEstimates: (estimates) => set({ estimates }),
  setEstimating: (v) => set({ estimating: v }),
  setPickup: (addr, lat, lng) =>
    set({ pickupAddress: addr, pickupLat: lat, pickupLng: lng, pickupCoords: lat && lng ? { lat, lng } : null }),
  setDropoff: (addr, lat, lng) =>
    set({ dropoffAddress: addr, dropoffLat: lat, dropoffLng: lng, dropoffCoords: lat && lng ? { lat, lng } : null }),
  clearRoute: () =>
    set({
      selectedVehicleType: null,
      estimates: [],
      pickupAddress: "",
      dropoffAddress: "",
      pickupLat: null,
      pickupLng: null,
      dropoffLat: null,
      dropoffLng: null,
      scheduledAt: null,
      promoCode: null,
      promoDiscountBdt: 0,
      selectedPrefIds: [],
  appliedPromo: null,
  pickupCoords: null,
  dropoffCoords: null,
  selectedDiscount: null,
  stops: [],
  }),
  setActiveRide: (ride) => set({ activeRide: ride }),
  patchActiveRide: (patch) =>
    set((s) => ({
      activeRide: s.activeRide
        ? ({ ...s.activeRide, ...patch } as ActiveRide)
        : ({ ...patch } as ActiveRide),
    })),
  setSearchingRideId: (id) => set({ searchingRideId: id }),
  setRideStatus: (status) => set({ rideStatus: status }),
  setScheduledAt: (iso) => set({ scheduledAt: iso }),
  setPromoCode: (code) => set({ promoCode: code }),
  setPromoDiscount: (bdt) => set({ promoDiscountBdt: bdt }),
  setSelectedPrefIds: (ids) => set({ selectedPrefIds: ids }),
  updateDriverLocation: (lat, lng) => {
    const ride = get().activeRide;
    if (ride)
      set({ activeRide: { ...ride, driver_lat: lat, driver_lng: lng } });
  },

  setRider: (patch) => set((s) => ({ name: patch.name ?? s.name, photo: patch.photo ?? s.photo })),
  setScheduledRides: (rides) => set({ scheduledRides: rides }),
  setCompletedRides: (rides) => set({ completedRides: rides }),
  setPaymentMethods: (methods) => set({ paymentMethods: methods }),
  applyPromo: (_promo: unknown) => {
    // Persisted by the API; no local state required beyond the optimistic UI.
  },
  setRecentReceipts: (receipts) => set({ recentReceipts: receipts }),
  setWalletBalance: (balance) => set({ walletBalance: balance }),
  setTransactionHistory: (history) => set({ transactionHistory: history }),
  setAppliedPromo: (promo) => set({ appliedPromo: promo }),
   setPickupCoords: (coords) => set({ pickupCoords: coords }),
  setDropoffCoords: (coords) => set({ dropoffCoords: coords }),
  setSelectedDiscount: (discount) => set({ selectedDiscount: discount }),
  setStops: (stops) => set({ stops }),

  fetchActiveRide: async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/rider/ride/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        set({ activeRide: null, rideStatus: "idle" });
        return;
      }
      const data = await res.json();
      if (data.ride) {
        set({ activeRide: data.ride, rideStatus: mapStatus(data.ride.status) });
      } else {
        set({ activeRide: null, rideStatus: "idle" });
      }
    } catch {
      set({ activeRide: null, rideStatus: "idle" });
    }
  },
  fetchRideHistory: async (token: string) => {
    try {
      const res = await fetch(`${API_URL}/api/ride/get-all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { data } = await res.json();
      const completed = (data ?? [])
        .filter((r: any) => r.status === "completed")
        .map((r: any) => ({
          id: r.ride_id,
          vehicle_type: r.vehicle_type,
          date: r.completed_at ?? r.created_at,
          pickup_address: r.origin_address,
          destination_address: r.destination_address,
          fare_bdt: r.fare_breakdown?.total_bdt ?? 0,
        }));
      const scheduled = (data ?? [])
        .filter((r: any) => r.scheduled_at && r.status === "pending")
        .map((r: any) => ({
          id: r.ride_id,
          vehicle_type: r.vehicle_type,
          date: r.scheduled_at,
          pickup_address: r.origin_address,
          destination_address: r.destination_address,
          fare_bdt: r.fare_breakdown?.total_bdt ?? 0,
        }));
      set({ completedRides: completed, scheduledRides: scheduled });
    } catch {
      // silently fail — screens show empty state
    }
  },
}));

function mapStatus(dbStatus: string): RiderState["rideStatus"] {
  switch (dbStatus) {
    case "pending":
    case "dispatching":
      return "finding";
    case "matched":
    case "driver_arriving":
      return "arriving";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "expired":
    case "no_drivers":
      return "expired";
    default:
      return "idle";
  }
}
