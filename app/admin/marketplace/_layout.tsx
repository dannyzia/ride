/**
 * Marketplace admin sub-layout — Expo Router Stack.
 */
import { Stack } from "expo-router";
import { colors } from "@/theme/goRide";

export default function MarketplaceLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.darkSurface },
      }}
    >
      <Stack.Screen name="overview" />
      <Stack.Screen name="shops" />
      <Stack.Screen name="rental" />
      <Stack.Screen name="delivery" />
      <Stack.Screen name="emergency" />
      <Stack.Screen name="certifications" />
      <Stack.Screen name="service-zones" />
      <Stack.Screen name="couriers" />
    </Stack>
  );
}
