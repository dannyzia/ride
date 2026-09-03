import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

const STATUS_LABEL_KEYS: Record<string, string> = {
  pending: "driver_history.status_pending",
  dispatching: "driver_history.status_dispatching",
  matched: "driver_history.status_matched",
  driver_arriving: "driver_history.status_driver_arriving",
  driver_arrived: "driver_history.status_driver_arrived",
  in_progress: "driver_history.status_in_progress",
  completed: "driver_history.status_completed",
  cancelled: "driver_history.status_cancelled",
  expired: "driver_history.status_expired",
  no_drivers: "driver_history.status_no_drivers",
  scheduled: "driver_history.status_scheduled",
};

interface TripDetail {
  ride_id: string;
  origin_address: string;
  destination_address: string;
  vehicle_type: string;
  status: string;
  fare_breakdown: { total_bdt?: number } | null;
  origin_latitude: number;
  origin_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  created_at: string;
}

export default function DriverTripDetail() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError("");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError(t('wallet.not_authenticated')); setLoading(false); return; }
        const res = await fetch(`${API_URL}/api/ride/get-all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || t('driver_history.failed_to_load_trip')); return; }
        const found = (json.data || []).find((r: { ride_id: string }) => r.ride_id === id);
        if (!cancelled) setTrip(found ?? null);
      } catch (err) {
        if (!cancelled) setError((err instanceof Error ? err.message : String(err)) || t('wallet.network_error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px]" style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('driver_history.trip_details')}</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-center" style={{ color: colors.danger }}>{error}</Text>
        </View>
      ) : trip ? (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          <View className="p-[16px] border rounded-[12px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
            <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
              {trip.vehicle_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </Text>
            <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>
              {STATUS_LABEL_KEYS[trip.status] ? t(STATUS_LABEL_KEYS[trip.status]) : trip.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </Text>
            <View className="mt-3 space-y-1">
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                {t('driver_history.from', { address: trip.origin_address ?? "—" })}
              </Text>
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                {t('driver_history.to', { address: trip.destination_address ?? "—" })}
              </Text>
            </View>
            <View className="flex-row justify-between items-center mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: borderColor }}>
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>
                {new Date(trip.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </Text>
              <Text className="text-[16px] font-JakartaBold" style={{ color: colors.primary }}>
                ৳{((trip.fare_breakdown?.total_bdt ?? 0) / 100).toFixed(0)}
              </Text>
            </View>
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta" style={{ color: textSecondary }}>{t('driver_history.trip_not_found')}</Text>
        </View>
      )}
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
