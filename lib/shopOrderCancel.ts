/**
 * shopOrderCancel.ts — customer cancel pre-pickup rules (plan 27 §5, F-11).
 *
 * A customer may cancel while the order is pre-pickup; the fee is
 * state-dependent and fresh-read from platform_config (seeds-not-constants —
 * launch default seed is 0, admin can raise it). Once a courier has picked
 * the item up the cancel path is closed (the F-38 dispute link is the route).
 */
import { requireConfigInt } from './platformConfig';

/**
 * States from which the customer can still cancel. `delivered`, `refunded`,
 * `cancelled` are terminal; `picked_up`/`out_for_delivery` are post-handover
 * (courier has the goods — dispute path, not cancel).
 */
export const CUSTOMER_CANCELLABLE_STATES = [
  'pending',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'dispatched',
  'courier_assigned',
  // workshop service bookings, before the shop confirms the window
  'booked',
  'confirmed',
] as const;

/** Free before the shop accepts; the configured fee applies after. */
export async function cancelFeeBdt(status: string): Promise<number> {
  if (status === 'pending' || status === 'booked') return 0;
  return requireConfigInt('shop_order_cancel_fee_after_accept_bdt');
}
