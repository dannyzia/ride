// Stage 3b — Driver monetization state store (Item 29 / DESIGN-POSTPAID-MONETIZATION.md §5).
//
// Single source of truth for the driver's monetization surface across the
// onboarding choice screen, packages screen, driver-home six-state banner,
// wallet dues card and due-amounts screen. Populated from GET /api/driver/dues
// (the canonical itemized dues endpoint, server-computed; never client-trusted).
// reset() is wired into lib/authCleanup.ts storeRegistry so sign-out can't
// leak per-account monetization state.
import { create } from "zustand";
import { API_URL } from "@/lib/config";

export interface OpenBill {
  id: string;
  amount_bdt: number;
  due_at: string | null;
}

export interface SubscriptionInfo {
  id: string;
  package_name: string | null;
  calls_remaining: number | null;
  expires_at: string | null;
  status: string;
  frozen_at: string | null;
}

export type MonetizationState =
  | "NO_PRODUCT"
  | "CEILING_LOCKED"
  | "LAPSED"
  | "OWING"
  | "PRODUCT_FROZEN"
  | "ACTIVE"
  | null;

interface DriverMonetizationState {
  state: MonetizationState;
  openBills: OpenBill[];
  totalUnpaid: number;
  headroom: number;
  ceilingWarn: boolean;
  callsWarn: boolean;
  frozenSubscription: SubscriptionInfo | null;
  activeSubscription: SubscriptionInfo | null;
  isDispatchLocked: boolean;
  fetchMonetization: (token: string) => Promise<void>;
  reset: () => void;
}

export const useDriverMonetizationStore = create<DriverMonetizationState>((set) => ({
  state: null,
  openBills: [],
  totalUnpaid: 0,
  headroom: 0,
  ceilingWarn: false,
  callsWarn: false,
  frozenSubscription: null,
  activeSubscription: null,
  isDispatchLocked: false,

  fetchMonetization: async (token: string) => {
    const res = await fetch(`${API_URL}/api/driver/dues`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    set({
      state: data.monetization_state ?? null,
      openBills: (data.open_bills ?? []).map((b: { id: string; amount_bdt: number; due_at: string | null }) => ({
        id: b.id,
        amount_bdt: b.amount_bdt,
        due_at: b.due_at,
      })),
      totalUnpaid: Number(data.total_unpaid_paisa ?? 0),
      headroom: Number(data.credit_headroom_paisa ?? 0),
      ceilingWarn: Boolean(data.warning_flags?.ceiling_80pct),
      callsWarn: Boolean(data.warning_flags?.calls_low),
      frozenSubscription: data.frozen_subscription
        ? {
            id: data.frozen_subscription.id,
            package_name: data.frozen_subscription.package_name,
            calls_remaining: data.frozen_subscription.calls_remaining,
            expires_at: data.frozen_subscription.expires_at,
            status: data.frozen_subscription.status,
            frozen_at: data.frozen_subscription.frozen_at,
          }
        : null,
      activeSubscription: data.active_subscription
        ? {
            id: data.active_subscription.id,
            package_name: data.active_subscription.package_name,
            calls_remaining: data.active_subscription.calls_remaining,
            expires_at: data.active_subscription.expires_at,
            status: data.active_subscription.status,
            frozen_at: data.active_subscription.frozen_at,
          }
        : null,
      isDispatchLocked: Boolean(data.is_dispatch_locked),
    });
  },

  reset: () =>
    set({
      state: null,
      openBills: [],
      totalUnpaid: 0,
      headroom: 0,
      ceilingWarn: false,
      callsWarn: false,
      frozenSubscription: null,
      activeSubscription: null,
      isDispatchLocked: false,
    }),
}));
