/**
 * Delivery Man surface route group (S6 plan 27 §6.1) — dispatched-offers
 * inbox, active delivery, earnings. In-app (phone); rides on the (main)
 * shell, which owns the session check (app/(main)/_layout.tsx).
 *
 * AUTHORIZATION IS SERVER-SIDE, not here: the screens hold no role gate of
 * their own because every endpoint they call (`/api/delivery/offers`,
 * `/offers/[id]/respond`, `/active/[id]/action`, `/earnings`) is guarded by
 * `requireDeliveryAgent` (lib/marketplaceRbac.ts — an active `couriers` row OR
 * a driver with the Deliveries toggle ON, i.e. both roles per Amendment 2)
 * and answers 403. The inbox renders its not-eligible state from that 403
 * rather than deciding eligibility itself, so a tampered client gains nothing.
 */
import { Stack } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";

export default function DeliveryLayout() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: bg },
      }}
    />
  );
}
