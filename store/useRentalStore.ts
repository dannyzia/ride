/**
 * Rental marketplace state store.
 * Handles rental requests, bids, and assignments.
 * Does NOT extend useRiderStore or useDriverStore (module isolation).
 */
import { create } from "zustand";

export type RentalBookingStep = "FORM" | "BIDDING" | "AWARDED" | "ASSIGNED" | "CONFIRMED";

export interface RentalRequest {
  id: string;
  category: string;
  urgency: string;
  status: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  cargo_tags?: string[] | null;
  cargo_weight_kg?: number | null;
  cargo_volume_m3?: string | number | null;
  cargo_description?: string | null;
  rental_options?: string | null;
  requested_vehicle_type: string | null;
  scheduled_start_at?: string | null;
  duration_hours?: number | null;
  bidding_window_seconds: number;
  soft_deadline_at: string;
  awarded_bid_id: string | null;
  awarded_at: string | null;
  confirmation_deadline_at: string | null;
  tracking_required: boolean;
  created_at: string;
}

export interface RentalBid {
  id: string;
  request_id: string;
  fleet_id: string;
  vehicle_type: string;
  quoted_price_bdt: number;
  quoted_notes: string | null;
  status: string;
  submitted_at: string;
  rank?: number;
  rank_badge?: string | null;
  fleet_rating?: number;
  fleet_completed_count?: number;
}

interface RentalState {
  // Active request
  activeRequest: RentalRequest | null;
  bids: RentalBid[];
  selectedBidId: string | null;

  // History
  requests: RentalRequest[];

  // Loading
  loading: boolean;

  // Actions
  setActiveRequest: (req: RentalRequest | null) => void;
  setBids: (bids: RentalBid[]) => void;
  setSelectedBidId: (id: string | null) => void;
  setRequests: (requests: RentalRequest[]) => void;
  setLoading: (loading: boolean) => void;
  addBid: (bid: RentalBid) => void;
  updateRequestStatus: (status: string) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  activeRequest: null,
  bids: [],
  selectedBidId: null,
  requests: [],
  loading: false,
};

export const useRentalStore = create<RentalState>((set) => ({
  ...INITIAL_STATE,

  setActiveRequest: (activeRequest) => set({ activeRequest }),
  setBids: (bids) => set({ bids }),
  setSelectedBidId: (selectedBidId) => set({ selectedBidId }),
  setRequests: (requests) => set({ requests }),
  setLoading: (loading) => set({ loading }),
  addBid: (bid) => set((state) => ({ bids: [...state.bids, bid] })),
  updateRequestStatus: (status) =>
    set((state) => ({
      activeRequest: state.activeRequest
        ? { ...state.activeRequest, status }
        : null,
    })),
  reset: () => set(INITIAL_STATE),
}));
