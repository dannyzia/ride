import { useState, useEffect, useRef } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, ActivityIndicator, TouchableOpacity, StatusBar, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

// Plan 28 Stage 4: the public share-link page is a Live Status & Safety
// Card — no native map. The receiver sees the ride state, how fresh the
// driver's GPS signal is, who the driver is, and a 1-tap police button.
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  scheduled: "Scheduled",
  dispatching: "Searching for driver",
  matched: "Driver on the way",
  driver_arriving: "Driver arriving",
  driver_arrived: "Driver arrived",
  in_progress: "On the way",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
  no_drivers: "No drivers available",
};

const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  pending: { bg: "#E8EAF6", fg: colors.info },
  scheduled: { bg: "#E8EAF6", fg: colors.info },
  dispatching: { bg: "#E8EAF6", fg: colors.info },
  matched: { bg: colors.amberLight, fg: "#B45309" },
  driver_arriving: { bg: colors.amberLight, fg: "#B45309" },
  driver_arrived: { bg: colors.amberLight, fg: "#B45309" },
  in_progress: { bg: "#E6F2FF", fg: colors.info },
  completed: { bg: "#E6F4EA", fg: colors.success },
  cancelled: { bg: "#FDE8E8", fg: colors.danger },
  expired: { bg: "#F3F4F6", fg: "#6B7280" },
  no_drivers: { bg: "#F3F4F6", fg: "#6B7280" },
};

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "expired", "no_drivers"]);
const FRESHNESS_OK_SECONDS = 15;

interface TrackData {
  status: string;
  driver_name: string | null;
  driver_rating: string | null;
  vehicle_type: string | null;
  driver_lat: number | null;
  driver_lng: number | null;
  driver_location_updated_at: number | null;
  driver_location_age_seconds: number | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
}

export default function PublicTrackPage() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [data, setData] = useState<TrackData | null>(null);
  const [error, setError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    if (!rideId) return;
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_URL}/api/ride/${rideId}/track`);
        if (res.ok) {
          const responseData = (await res.json()) as TrackData;
          setData(responseData);
          setError("");
          // Terminal rides never change again — stop the 10s poller
          // immediately so a finished trip stops refetching.
          if (TERMINAL_STATUSES.has(responseData.status)) stopPolling();
        } else {
          // 404 (or any failure status): the ride is gone — show the error
          // state and stop polling instead of hammering a dead link.
          setData(null);
          setError("Ride not found or no longer trackable");
          stopPolling();
        }
      } catch {
        setData(null);
        setError("Network error — retrying...");
      }
    };
    fetchData();
    intervalRef.current = setInterval(fetchData, 10_000);
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  const statusStyle = (status: string) => STATUS_STYLES[status] ?? { bg: "#F3F4F6", fg: "#6B7280" };

  const renderFreshnessBadge = (track: TrackData) => {
    if (TERMINAL_STATUSES.has(track.status)) return null;
    const age = track.driver_location_age_seconds;
    if (age == null) {
      return (
        <View
          testID="track.rideId.freshness-badge"
          className="flex-row items-center rounded-full px-3 py-2"
          style={{ backgroundColor: isDark ? colors.surfaceElevatedDark : colors.gray100 }}
        >
          <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: "#9CA3AF" }} />
          <Text className="text-[13px] font-JakartaSemiBold" style={{ color: textSecondary }}>
            Waiting for GPS signal
          </Text>
        </View>
      );
    }
    const fresh = age <= FRESHNESS_OK_SECONDS;
    return (
      <View
        testID="track.rideId.freshness-badge"
        className="flex-row items-center rounded-full px-3 py-2"
        style={{ backgroundColor: fresh ? "#E6F4EA" : colors.amberLight }}
      >
        <View
          className="w-2 h-2 rounded-full mr-2"
          style={{ backgroundColor: fresh ? colors.success : colors.amber }}
        />
        <Text
          className="text-[13px] font-JakartaSemiBold"
          style={{ color: fresh ? colors.success : "#B45309" }}
        >
          {fresh ? `Live GPS Signal (Updated ${age}s ago)` : `Signal Delayed (${age}s ago)`}
        </Text>
      </View>
    );
  };

  if (error && !data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <Text className="text-[16px] font-Jakarta text-goDanger text-center">{error}</Text>
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
         testID="track.rideId.set-theme">
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="mt-4 text-[14px] font-Jakarta" style={{ color: textSecondary }}>Loading ride info...</Text>
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
         testID="track.rideId.set-theme-2">
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const pill = statusStyle(data.status);
  const rating = data.driver_rating != null ? parseFloat(data.driver_rating) : NaN;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="px-[24px] py-[16px] border-b flex-row items-center justify-between" style={{ borderColor }}>
        <Text className="text-[20px] font-JakartaBold" style={{ color: textPrimary }}>Ride Tracking</Text>
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
         testID="track.rideId.set-theme-3">
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
        </TouchableOpacity>
      </View>

      <View className="flex-1 px-[24px] py-[16px] gap-4">
        {/* Status pill */}
        <View className="flex-row">
          <View
            testID="track.rideId.status-pill"
            className="rounded-full px-4 py-2"
            style={{ backgroundColor: pill.bg }}
          >
            <Text className="text-[15px] font-JakartaBold" style={{ color: pill.fg }}>
              {STATUS_LABELS[data.status] ?? data.status}
            </Text>
          </View>
        </View>

        {/* Signal freshness badge */}
        <View className="flex-row">{renderFreshnessBadge(data)}</View>

        {/* Driver & vehicle information card */}
        {data.driver_name ? (
          <View
            testID="track.rideId.driver-card"
            className="rounded-2xl p-4 border"
            style={{ backgroundColor: surfaceBg, borderColor }}
          >
            <View className="flex-row items-center">
              <View
                className="w-12 h-12 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: colors.primary + "20" }}
              >
                <Text className="text-[20px] font-JakartaBold" style={{ color: colors.primary }}>
                  {data.driver_name[0]?.toUpperCase() ?? "D"}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-[17px] font-JakartaBold" style={{ color: textPrimary }}>
                  {data.driver_name}
                </Text>
                <View className="flex-row items-center mt-1">
                  <Ionicons name="star" size={13} color={colors.amber} />
                  <Text className="text-[13px] font-JakartaSemiBold ml-1" style={{ color: textSecondary }}>
                    {Number.isFinite(rating) ? rating.toFixed(1) : "New driver"}
                  </Text>
                </View>
              </View>
            </View>
            {data.vehicle_type ? (
              <View className="flex-row items-center mt-3 pt-3 border-t" style={{ borderColor }}>
                <Ionicons name="car-outline" size={18} color={textSecondary} />
                <Text className="text-[14px] font-Jakarta ml-2" style={{ color: textSecondary }}>
                  {data.vehicle_type}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Trip endpoints (coords only — the share link carries no addresses) */}
        {data.origin_lat != null && data.destination_lat != null ? (
          <View
            testID="track.rideId.route-summary"
            className="rounded-2xl p-4 border"
            style={{ backgroundColor: surfaceBg, borderColor }}
          >
            <View className="flex-row items-center">
              <View className="w-2.5 h-2.5 rounded-full mr-3" style={{ backgroundColor: colors.success }} />
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                {Number(data.origin_lat).toFixed(4)}, {Number(data.origin_lng).toFixed(4)}
              </Text>
            </View>
            <View className="flex-row items-center mt-2">
              <View className="w-2.5 h-2.5 rounded-full mr-3" style={{ backgroundColor: colors.danger }} />
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                {Number(data.destination_lat).toFixed(4)}, {Number(data.destination_lng).toFixed(4)}
              </Text>
            </View>
          </View>
        ) : null}

        <View className="flex-1" />

        {/* Emergency: 1-tap native cellular dialer (owner ruling 2026-11-01 —
            tel: is the sole calling mechanism, no VoIP, no masking). */}
        <TouchableOpacity
          className="rounded-full py-4 items-center justify-center flex-row"
          style={{ backgroundColor: colors.danger }}
          onPress={() => Linking.openURL("tel:999")}
         testID="track.rideId.el-1">
          <Ionicons name="call" size={18} color={colors.white} />
          <Text className="text-[16px] font-JakartaBold ml-2" style={{ color: colors.white }}>
            Call 999 Police (Emergency)
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
