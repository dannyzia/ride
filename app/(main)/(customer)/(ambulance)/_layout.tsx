/**
 * Ambulance route group layout (customer emergency screens).
 */
import { Stack } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";

export default function AmbulanceLayout() {
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
