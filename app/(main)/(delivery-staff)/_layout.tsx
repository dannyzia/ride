/**
 * Delivery staff surface route group (Item 12) — dashboard, packages, dues.
 * Mirrors the shop-owner route group shell; delivery staff live in a separate
 * route group under /(main)/(delivery-staff) so the rider/shop-owner/fleet
 * boundaries stay explicit.
 */
import { Stack } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";

export default function DeliveryStaffLayout() {
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
