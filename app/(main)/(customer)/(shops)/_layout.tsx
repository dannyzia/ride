/**
 * Shops marketplace route group layout.
 */
import { Stack } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";

export default function ShopsLayout() {
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
