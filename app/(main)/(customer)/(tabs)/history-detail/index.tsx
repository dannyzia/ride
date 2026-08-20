import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface RideDetail {
  id: string;
  vehicle_type: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  distance_km: number;
  duration_minutes: number;
  total_bdt: number;
  driver_name: string;
  driver_rating: number;
  created_at: string;
}

export default function RideHistoryDetail() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const { id } = useLocalSearchParams<{ id: string }>();
  const [ride, setRide] = useState<RideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError("");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); setLoading(false); return; }
        const res = await fetch(`${API_URL}/api/ride/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed to load ride"); return; }
        if (!cancelled) setRide(data.ride);
      } catch (err) {
        if (!cancelled) setError((err instanceof Error ? err.message : String(err)) || "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat("bn-BD", {
        weekday: "short",
        month: "short",
        day: "numeric",
        numberingSystem: "latn",
        timeZone: "Asia/Dhaka",
      }).format(d);
    } catch { return iso; }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px]" style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Ride Details</Text>
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
      ) : ride ? (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          <View className="p-[16px] border rounded-[12px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
            <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
              {ride.vehicle_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </Text>
            <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>
              {formatDate(ride.created_at)} · {ride.distance_km} km · {ride.duration_minutes} min
            </Text>
            <View className="mt-3 space-y-1">
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                From: {ride.pickup_address ?? "—"}
              </Text>
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                To: {ride.dropoff_address ?? "—"}
              </Text>
            </View>
            <View className="flex-row justify-between items-center mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: borderColor }}>
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>
                Driver: {ride.driver_name ?? "—"} <Ionicons name="star" size={12} color={textSecondary} /> {ride.driver_rating ?? "—"}
              </Text>
              <Text className="text-[16px] font-JakartaBold" style={{ color: colors.primary }}>
                ৳{(ride.total_bdt / 100).toFixed(0)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            className="border rounded-[12px] py-[14px] items-center mb-3"
            style={{ backgroundColor: surfaceBg, borderColor }}
            onPress={() => router.push(`/(main)/(customer)/(tabs)/activity/share-receipt?rideId=${ride.id}`)}
          >
            <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>View Receipt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="rounded-[12px] py-[14px] items-center"
            style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor: colors.danger }}
            onPress={() => router.push(`/(main)/(customer)/report-issue?rideId=${ride.id}`)}
          >
            <Text className="text-[15px] font-JakartaBold" style={{ color: colors.danger }}>Report an Issue</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta" style={{ color: textSecondary }}>Ride not found</Text>
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
