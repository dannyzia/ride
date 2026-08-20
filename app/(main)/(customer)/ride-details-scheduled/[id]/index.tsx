import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface RideDetail {
  id: string;
  status: string;
  vehicle_type: string;
  origin_address: string;
  destination_address: string;
  fare_breakdown: { total_bdt?: number };
  scheduled_at: string | null;
  created_at: string;
  driver: { name: string; phone: string; vehicle_type: string; rating: number } | null;
}

export default function RideDetailsScheduled() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ride, setRide] = useState<RideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError("");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); return; }
        const res = await fetch(`${API_URL}/api/ride/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed to load"); return; }
        if (!cancelled) setRide(data.ride);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
        logger.error("RideDetailsScheduled fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const dateStr = ride?.scheduled_at ?? ride?.created_at ?? "";
  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
  const formattedTime = dateStr ? new Date(dateStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
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
          <Text className="text-[15px] font-Jakarta text-center mb-4" style={{ color: colors.danger }}>{error}</Text>
          <TouchableOpacity
            className="rounded-full px-[24px] py-[12px]"
            style={{ backgroundColor: colors.primary }}
            onPress={() => { setLoading(true); setError(""); }}
          >
            <Text className="text-[16px] font-JakartaBold text-goWhite">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !ride ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-[18px] font-JakartaBold" style={{ color: textSecondary }}>Ride not found</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
          <View className="border rounded-[12px] p-[16px] mb-6" style={{ backgroundColor: surfaceBg, borderColor }}>
            <View className="flex-row items-center mb-3">
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}
              >
                <Ionicons name="calendar" size={20} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
                  {ride.vehicle_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? "Ride"}
                </Text>
                <Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>
                  {formattedDate} · {formattedTime}
                </Text>
              </View>
            </View>
            <View className="gap-1">
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>
                Pickup: {ride.origin_address ?? "—"}
              </Text>
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>
                Destination: {ride.destination_address ?? "—"}
              </Text>
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>
                Fare: ৳{((ride.fare_breakdown?.total_bdt ?? 0) / 100).toFixed(0)}
              </Text>
            </View>
          </View>
          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 rounded-full py-[14px] items-center"
              style={{ backgroundColor: colors.primary }}
              onPress={() => router.push("/(main)/(customer)/rate-driver")}
            >
              <Text className="text-[16px] font-JakartaBold text-goWhite">Rate Driver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 border rounded-full py-[14px] items-center"
              style={{ borderColor }}
              onPress={() => router.replace("/(main)/(customer)/cancel-reason")}
            >
              <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
