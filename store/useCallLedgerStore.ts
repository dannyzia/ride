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
  /**
   * Authoritative call balance (-1 = unlimited sentinel). Updated by the
   * server-pushed `lead:billed` message (debit-on-offer, Phase D) and by the
   * ledger API fetch. Null until the first authoritative value arrives.
   */
  balanceCalls: number | null;
  /**
   * Cost in calls of the most recent lead debit — always 1 under sequential
   * dispatch (§6). Surfaced for the offer card / wallet copy.
   */
  lastLeadCostCalls: number | null;
  fetchTransactions: (driverId: string, limit?: number) => Promise<void>;
  /** Apply a server-pushed authoritative balance after an offer-time debit. */
  applyLeadBilled: (balanceAfterCalls: number) => void;
  /** Set the balance from an authoritative fetch (ledger API). */
  setBalanceCalls: (calls: number | null) => void;
  clear: () => void;
}

export const useCallLedgerStore = create<CallLedgerStore>((set) => ({
  transactions: [],
  loading: false,
  balanceCalls: null,
  lastLeadCostCalls: null,

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

  applyLeadBilled: (balanceAfterCalls) =>
    set({ balanceCalls: balanceAfterCalls, lastLeadCostCalls: 1 }),

  setBalanceCalls: (calls) => set({ balanceCalls: calls }),

  clear: () =>
    set({
      transactions: [],
      loading: false,
      balanceCalls: null,
      lastLeadCostCalls: null,
    }),
}));
