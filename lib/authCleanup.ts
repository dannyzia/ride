import { useRiderStore } from "@/store/useRiderStore";
import { useDriverStore } from "@/store/useDriverStore";
import { useChatStore } from "@/store/useChatStore";

/**
 * Single source of truth for sign-out state cleanup (doc 03 R2.5 #4 / §7).
 *
 * Order: rider reset → driver reset → chat clear. Every call is guarded
 * (`if (S.getState().reset)`) so the helper survives store refactors.
 *
 * Two rules the doc makes binding:
 * - Import driver state from `@/store/useDriverStore` ONLY — the barrel
 *   (`@/store`) exports a legacy, reset-less store under the same name.
 * - Never touch barrel stores.
 *
 * The caller is responsible for `supabase.auth.signOut()` (async) and for
 * NOT navigating manually afterward — the auth gate handles the redirect.
 */
export function authCleanup(): void {
  const riderReset = useRiderStore.getState().reset;
  if (riderReset) riderReset();
  const driverReset = useDriverStore.getState().reset;
  if (driverReset) driverReset();
  const chatClear = useChatStore.getState().clearChat;
  if (chatClear) chatClear();
}
