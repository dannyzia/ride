/**
 * Fleet layout — Stack navigator for all fleet screens.
 * Guard: redirects to driver home if user has no fleet context.
 */
import { Stack, router } from "expo-router";
import { useEffect } from "react";
import { useFleetStore } from "@/store/useFleetStore";
import { logger } from "@/lib/logger";

export default function FleetLayout() {
  const activeFleetId = useFleetStore((s) => s.activeFleetId);
  const activeMode = useFleetStore((s) => s.activeMode);

  useEffect(() => {
    if (activeMode !== "FLEET" || !activeFleetId) {
      logger.info("[fleet-layout] no fleet context, redirecting");
      router.replace("/(main)/(rider)");
    }
  }, [activeMode, activeFleetId]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
