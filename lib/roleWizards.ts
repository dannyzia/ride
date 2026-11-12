/**
 * Shared role→wizard registry (Node launch Stage 4 / Component C).
 *
 * Single source of truth for the three operator-role wizard routes.
 * Absorbs the four previous copies:
 *   - login-as.tsx RESUBMIT_WIZARD
 *   - register.tsx ROLE_WIZARD
 *   - add-role/index.tsx ADDABLE route fields
 *   - verification-status.tsx RESUBMIT_ROUTE
 */
export const ROLE_WIZARDS: Record<string, string> = {
  shop_owner: "/(auth)/register-shop-owner",
  fleet_owner: "/(auth)/register-fleet-owner",
  delivery_man: "/(auth)/register-delivery-man",
};

/** Lookup a wizard route by role; undefined if the role has no wizard. */
export function wizardFor(role: string): string | undefined {
  return ROLE_WIZARDS[role];
}