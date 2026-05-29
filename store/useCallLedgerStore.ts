import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface LedgerEntry {
  id: string;
  subscription_id: string;
  driver_id: string;
  ride_id: string | null;
  event_type: string;
  delta: number;
  balance_after: number;
  reason: string | null;
  created_at: string;
}

interface CallLedgerStore {
  transactions: LedgerEntry[];
  loading: boolean;
  fetchTransactions: (driverId: string, limit?: number) => Promise<void>;
  clear: () => void;
}

export const useCallLedgerStore = create<CallLedgerStore>((set) => ({
  transactions: [],
  loading: false,

  fetchTransactions: async (driverId: string, limit = 50) => {
    set({ loading: true });
    try {
      const { data } = await supabase
        .from('call_ledger')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(limit);

      set({
        transactions: (data as unknown as LedgerEntry[]) ?? [],
        loading: false,
      });
    } catch {
      set({ transactions: [], loading: false });
    }
  },

  clear: () => set({ transactions: [], loading: false }),
}));
