import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface Subscription {
  id: string;
  driver_id: string;
  package_id: string;
  status: string;
  calls_remaining: number;
  daily_calls_used: number;
  total_deductions: number;
  started_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface CallPackage {
  id: string;
  name: string;
  call_count: number;
  duration_days: number;
  price_bdt: number;
}

interface PackageStore {
  activeSubscription: Subscription | null;
  activePackage: CallPackage | null;
  loading: boolean;
  fetchActiveSubscription: (driverId: string) => Promise<void>;
  clear: () => void;
}

export const usePackageStore = create<PackageStore>((set) => ({
  activeSubscription: null,
  activePackage: null,
  loading: false,

  fetchActiveSubscription: async (driverId: string) => {
    set({ loading: true });
    try {
      const { data: subData, error: subErr } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('driver_id', driverId)
        .eq('status', 'active')
        .single();

      if (subErr || !subData) {
        set({ activeSubscription: null, activePackage: null, loading: false });
        return;
      }

      const { data: pkgData } = await supabase
        .from('packages')
        .select('*')
        .eq('id', subData.package_id)
        .single();

      set({
        activeSubscription: subData as unknown as Subscription,
        activePackage: pkgData as unknown as CallPackage,
        loading: false,
      });
    } catch {
      set({ activeSubscription: null, activePackage: null, loading: false });
    }
  },

  clear: () => set({ activeSubscription: null, activePackage: null, loading: false }),
}));
