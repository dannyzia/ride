/**
 * Emergency ambulance state store (Phase 6).
 * Isolated store — never extends existing stores (house rule).
 */
import { create } from "zustand";

export interface EmergencyRequest {
  id: string;
  caller_user_id: string;
  pickup_address: string;
  pickup_lat: string | number;
  pickup_lng: string | number;
  dropoff_address?: string | null;
  patient_condition?: string | null;
  requires_paramedic: boolean;
  service_level: string | null;
  status: string;
  expires_at: string;
  created_at: string;
  accepted_cert_id?: string | null;
  failure_reason?: string | null;
  cancel_reason?: string | null;
}

interface EmergencyState {
  // Customer side — the emergency this caller created
  activeEmergency: EmergencyRequest | null;

  // Driver side — eligible broadcasts received over WS
  feed: EmergencyRequest[];

  // Actions
  setActiveEmergency: (req: EmergencyRequest | null) => void;
  setFeed: (feed: EmergencyRequest[]) => void;
  addOrUpdateFeedItem: (req: EmergencyRequest) => void;
  removeFromFeed: (requestId: string) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  activeEmergency: null,
  feed: [],
};

export const useEmergencyStore = create<EmergencyState>((set) => ({
  ...INITIAL_STATE,

  setActiveEmergency: (activeEmergency) => set({ activeEmergency }),
  setFeed: (feed) => set({ feed }),
  addOrUpdateFeedItem: (req) =>
    set((state) => {
      const rest = state.feed.filter((r) => r.id !== req.id);
      return { feed: [req, ...rest] };
    }),
  removeFromFeed: (requestId) =>
    set((state) => ({ feed: state.feed.filter((r) => r.id !== requestId) })),
  reset: () => set(INITIAL_STATE),
}));
