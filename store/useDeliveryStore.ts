/**
 * useDeliveryStore — delivery marketplace state.
 */
import { create } from 'zustand';

export interface DeliveryState {
  activeDeliveryId: string | null;
  courierMode: boolean; // true = user is a courier viewing courier-side screens
  courierType: 'parcel' | 'food' | null;

  setActiveDeliveryId: (id: string | null) => void;
  setCourierMode: (mode: boolean) => void;
  setCourierType: (type: 'parcel' | 'food' | null) => void;
  reset: () => void;
}

const initialState = {
  activeDeliveryId: null,
  courierMode: false,
  courierType: null,
};

export const useDeliveryStore = create<DeliveryState>((set) => ({
  ...initialState,

  setActiveDeliveryId: (id) => set({ activeDeliveryId: id }),
  setCourierMode: (mode) => set({ courierMode: mode }),
  setCourierType: (type) => set({ courierType: type }),
  reset: () => set(initialState),
}));
