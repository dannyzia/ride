/**
 * Shop Owner surface route group (S3 §3) — dashboard, catalog, workshop,
 * staff, settlement. In-app (phone); rides on the (main) shell but routes
 * via /api/shop/mine role data, not tab navigation.
 */
import { Stack } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";

export default function ShopOwnerLayout() {
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
