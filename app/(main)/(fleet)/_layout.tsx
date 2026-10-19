/**
 * Fleet layout — Stack navigator for all fleet screens.
 * Guard: redirects when there is no fleet context (activeMode + fleet id
 * come only from enterFleet — login-as for fleet_owner, or an in-app
 * surface that resolved /api/fleet/mine).
 *
 * C8-2: the fallback is the CUSTOMER home, not the driver home — the
 * previous driver-home redirect stranded pure business-fleet owners (no
 * drivers row: nothing behind the driver surface resolves for them) in a
 * bounce loop. The customer home is the universal safe surface: every
 * authenticated account lands there, and the fleet surface is re-entered
 * through login-as once /mine resolves a fleet.
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
      router.replace("/(main)/(customer)/home");
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
