import { useRiderStore } from "@/store/useRiderStore";
import { useDriverStore } from "@/store/useDriverStore";
import { useChatStore } from "@/store/useChatStore";
import { useDriverStatusStore } from "@/store/useDriverStatusStore";
import { usePackageStore } from "@/store/usePackageStore";
import { useCallLedgerStore } from "@/store/useCallLedgerStore";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { teardownRiderSocket } from "@/lib/riderSocket";
import { clearQueue } from "@/lib/sosQueue";
import { supabase } from "@/lib/supabase";

/**
 * Single source of truth for sign-out state cleanup (§6.10 / §7).
 *
 * Tears down the WebSocket singleton (audit H-1) and resets ALL 7 Zustand
 * stores. Every store call is guarded (`if (S.getState().reset)`) so the
 * helper survives store refactors.
 *
 * Two rules the doc makes binding:
 * - Import driver state from `@/store/useDriverStore` ONLY — the barrel
 *   (`@/store`) exports a legacy, reset-less store under the same name.
 * - Never touch barrel stores (useWSStore is the sanctioned exception: it
 *   lives only in the barrel and is reset via teardownRiderSocket()).
 *
 * The caller is responsible for `supabase.auth.signOut()` (async) and for
 * NOT navigating manually afterward — the auth gate handles the redirect.
 */
export function authCleanup(): void {
  // H-1: kill the WebSocket FIRST. A live socket keeps writing into the
  // stores while they reset, and one left open (still authenticated as the
  // previous user) must never be adopted by the next sign-in — the shared
  // WS slot is identity-tagged for exactly this.
  teardownRiderSocket();
  const riderReset = useRiderStore.getState().reset;
  if (riderReset) riderReset();
  const driverReset = useDriverStore.getState().reset;
  if (driverReset) driverReset();
  const chatClear = useChatStore.getState().clearChat;
  if (chatClear) chatClear();
  const driverStatusClear = useDriverStatusStore.getState().clear;
  if (driverStatusClear) driverStatusClear();
  const packageClear = usePackageStore.getState().clear;
  if (packageClear) packageClear();
  const callLedgerClear = useCallLedgerStore.getState().clear;
  if (callLedgerClear) callLedgerClear();
  const driverFlowReset = useDriverFlowStore.getState().reset;
  if (driverFlowReset) driverFlowReset();

  // Clear the SOS queue to prevent cross-account leakage.
  // The rider store reset() above already clears stagedPromo (client-side).
  // Server-side staged promos (promoCache.ts) expire via 10-min TTL.
  // Best-effort — we don't await because authCleanup is synchronous.
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user?.id) {
      clearQueue(session.user.id).catch(() => {});
    }
  }).catch(() => {});
}
