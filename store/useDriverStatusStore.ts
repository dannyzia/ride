import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface DriverStatusStore {
  driverStatus: string | null;
  isOnline: boolean;
  loading: boolean;
  fetchDriverStatus: (driverId: string) => Promise<void>;
  setOnline: (driverId: string, online: boolean) => Promise<void>;
  clear: () => void;
}

export const useDriverStatusStore = create<DriverStatusStore>((set) => ({
  driverStatus: null,
  isOnline: false,
  loading: false,

  fetchDriverStatus: async (driverId: string) => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('status, is_online')
        .eq('id', driverId)
        .single();

      if (error || !data) {
        set({ driverStatus: null, isOnline: false, loading: false });
        return;
      }

      set({
        driverStatus: (data as any).status as string,
        isOnline: Boolean((data as any).is_online),
        loading: false,
      });
    } catch {
      set({ driverStatus: null, isOnline: false, loading: false });
    }
  },

  setOnline: async (driverId: string, online: boolean) => {
    try {
      await supabase
        .from('drivers')
        .update({ is_online: online, updated_at: new Date().toISOString() })
        .eq('id', driverId);

      set({ isOnline: online });
    } catch {
      // silently fail — caller can check optimistic state
    }
  },

  clear: () => set({ driverStatus: null, isOnline: false, loading: false }),
}));
