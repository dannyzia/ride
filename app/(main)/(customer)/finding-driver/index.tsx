import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import Map from "@/components/Map";
import AlternativesSheet from "@/components/AlternativesSheet";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useRiderStore, type VehicleType } from "@/store/useRiderStore";
import { useWSStore } from "@/store";
import { supabase } from "@/lib/supabase";

const POLL_INTERVAL_MS = 10000;
const MAX_EMPTY_POLLS = 12;

interface Alternative {
  vehicle_type: VehicleType;
  fare_breakdown: { total_bdt: number };
  available_drivers: number;
}

// Statuses at which the ride is committed and the rider should move to tracking.
const COMMITTED_STATUSES = ["matched", "driver_arriving", "driver_arrived"];

export default function FindingDriver() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { pickupLat, pickupLng, selectedVehicleType, clearRoute, setSearchingRideId, setRideStatus, setSelectedVehicleType } = useRiderStore();
  const [count, setCount] = useState<number | null>(null);
  const [eta, setEta] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [prolongedEmpty, setProlongedEmpty] = useState(false);
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);
  const emptyPollCount = useRef(0);

  const goToTracking = useCallback((rideId: string) => {
    router.replace(`/(main)/(customer)/ride-tracking/${rideId}`);
  }, []);

  const handleSelectAlternative = useCallback(
    (vehicleType: string) => {
      setAlternatives(null);
      // The server only proposes values from VEHICLE_TYPE_VALUES, so the cast
      // is a runtime-safe narrowing of the wire string to the store union.
      setSelectedVehicleType(vehicleType as VehicleType);
      // Back to confirm-ride, which re-estimates for the new vehicle type
      // (its effect deps include selectedVehicleType) — the rider confirms and
      // a new ride request goes out with the alternative type.
      router.back();
    },
    [setSelectedVehicleType],
  );

  const handleAlternativesCancel = useCallback(() => {
    setAlternatives(null);
    // The ride is already terminal (no_drivers server-side) — send the rider
    // to the no-drivers screen instead of letting the pulse run on a dead ride.
    router.replace("/(main)/(customer)/no-drivers-available");
  }, []);

  // X-1: the WebSocket path is the PRIMARY transition out of this screen. The
  // push banner tap (root layout) is only the fallback — a rider whose banner
  // auto-dismissed, or whose OEM suppresses heads-up banners (the TD-01 class),
  // would otherwise pulse forever while the driver waits at the pickup for the
  // PIN. The server delivers ride:status / ride:expired / ride:alternatives to
  // the live rider socket via sendToRider (no subscription needed); depends on
  // the store socket so a self-healing reconnect re-attaches.
  const ws = useWSStore((s) => s.ws);
  useEffect(() => {
    if (!ws) return;
    const handler = (event: MessageEvent) => {
      let msg: { type?: string; ride_id?: string; status?: string; alternatives?: unknown };
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (
        msg.type === "ride:status" &&
        msg.ride_id &&
        COMMITTED_STATUSES.includes(msg.status ?? "")
      ) {
        goToTracking(msg.ride_id);
      } else if (msg.type === "ride:expired" && msg.ride_id) {
        router.replace("/(main)/(customer)/no-drivers-available");
      } else if (msg.type === "ride:alternatives" && Array.isArray(msg.alternatives)) {
        setAlternatives(msg.alternatives as Alternative[]);
      }
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws, goToTracking]);

  const pulse1 = useSharedValue(0);
  const pulse2 = useSharedValue(0);

  useEffect(() => {
    pulse1.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    pulse2.value = withRepeat(
      withDelay(1000, withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) })),
      -1,
      false
    );
  }, []);

  const pulse1Style = useAnimatedStyle(() => ({
    opacity: 0.4 * (1 - pulse1.value),
    transform: [{ scale: 0.8 + pulse1.value * 1.4 }],
  }));

  const pulse2Style = useAnimatedStyle(() => ({
    opacity: 0.3 * (1 - pulse2.value),
    transform: [{ scale: 0.6 + pulse2.value * 1.6 }],
  }));

  const fetchNearby = useCallback(async (signal: AbortSignal) => {
    if (!pickupLat || !pickupLng) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token || signal.aborted) return;

      const vehicleType = selectedVehicleType || "car_economy";
      const res = await fetch(`${API_URL}/api/ride/nearby-drivers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pickup_lat: pickupLat,
          pickup_lng: pickupLng,
          vehicle_type: vehicleType,
        }),
        signal,
      });

      if (signal.aborted) return;

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        logger.error("[finding-driver] nearby failed", { status: res.status, error: data.error });
        setError(true);
        return;
      }

      const data = await res.json();
      if (data.count > 0) {
        setCount(data.count);
        setEta(data.estimated_wait_minutes);
        emptyPollCount.current = 0;
        setProlongedEmpty(false);
      } else {
        setCount(0);
        setEta(null);
        emptyPollCount.current += 1;
        if (emptyPollCount.current >= MAX_EMPTY_POLLS) {
          setProlongedEmpty(true);
        }
      }
      setError(false);
    } catch (e) {
      if (!(e instanceof Error) || e.name !== "AbortError") {
        logger.error("[finding-driver] nearby fetch failed", e);
        setError(true);
      }
    }
  }, [pickupLat, pickupLng, selectedVehicleType]);

  const handleCancel = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const rideId = useRiderStore.getState().searchingRideId;
      if (rideId && token) {
        await fetch(`${API_URL}/api/ride/${rideId}/cancel`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });
      }
    } catch {
      // non-blocking: still clear local state
    } finally {
      clearRoute();
      setSearchingRideId(null);
      setRideStatus("idle");
      setSelectedVehicleType(null);
      router.back();
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const tick = () => {
      fetchNearby(controller.signal);
    };
    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchNearby]);

  const showCountEta = !error && count !== null && count > 0;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
        translucent
      />
      {/* Theme toggle */}
      <TouchableOpacity
        style={[styles.themeToggle, { backgroundColor: surfaceBg, borderColor }]}
        onPress={() => setTheme(isDark ? "light" : "dark")}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>

      {/* Map Area (top 40%) */}
      <View className="flex-[4] relative">
        <Map />
        {/* Pulse overlay centered on user location */}
        <View className="absolute inset-0 items-center justify-center pointer-events-none">
          <Animated.View
            className="w-24 h-24 rounded-full border-2"
            style={[
              { borderColor: colors.primary + "40" },
              pulse1Style,
            ]}
          />
          <Animated.View
            className="w-16 h-16 rounded-full border-2 absolute"
            style={[
              { borderColor: colors.primary + "60" },
              pulse2Style,
            ]}
          />
        </View>
      </View>

      {/* Bottom Card (60%) */}
      <View
        className="flex-[6] rounded-t-3xl px-6 pt-6 pb-8"
        style={{
          backgroundColor: surfaceBg,
          borderTopWidth: 1,
          borderTopColor: borderColor,
        }}
      >
        <View className="items-center mb-6">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            className="text-[20px] font-JakartaBold mt-4"
            style={{ color: textPrimary }}
          >
            Finding your driver...
          </Text>
          <Text
            className="text-sm font-Jakarta text-center mt-2"
            style={{ color: textSecondary }}
          >
            {prolongedEmpty
              ? "Drivers are busy — keep waiting or try another vehicle type"
              : "Searching for nearby drivers…"}
          </Text>
        </View>

        {/* Nearby count + ETA — only shown on success with count > 0 */}
        {showCountEta && (
          <View
            className="rounded-2xl p-4 mb-6"
            style={{ backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }}
          >
            <View className="flex-row items-center mb-2">
              <Ionicons name="car" size={20} color={colors.primary} />
              <Text className="ml-2 text-base font-JakartaSemiBold" style={{ color: textPrimary }}>
                {count} nearby driver{count !== 1 ? "s" : ""}
              </Text>
            </View>
            <View className="flex-row items-center">
              <Ionicons name="time" size={20} color={colors.primary} />
              <Text className="ml-2 text-base font-Jakarta" style={{ color: textSecondary }}>
                Estimated wait: {eta} min
              </Text>
            </View>
          </View>
        )}

        {/* Cancel Booking */}
        <TouchableOpacity
          className="rounded-full py-4 items-center border"
          style={{ borderColor: colors.danger }}
          onPress={handleCancel}
        >
          <Text className="text-base font-JakartaBold" style={{ color: colors.danger }}>
            Cancel Booking
          </Text>
        </TouchableOpacity>
      </View>

      {/* X-2a: vehicle-downgrade offers from the server (ride:alternatives) */}
      {alternatives && alternatives.length > 0 && (
        <AlternativesSheet
          visible
          alternatives={alternatives}
          onSelect={handleSelectAlternative}
          onCancel={handleAlternativesCancel}
        />
      )}
    </SafeAreaView>
  );
}

const styles = {
  themeToggle: {
    position: "absolute" as const,
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    zIndex: 100,
    borderWidth: 1,
  },
};
