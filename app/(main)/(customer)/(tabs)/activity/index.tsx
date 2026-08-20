import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRiderStore } from "@/store/useRiderStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function ActivityOngoing() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const { activeRide, fetchActiveRide } = useRiderStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          await fetchActiveRide(token);
        }
      } catch (err) {
        logger.error("Activity fetchActiveRide failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchActiveRide]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px]" style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Ongoing</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        {activeRide ? (
          <View>
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}>
                <Ionicons name="car" size={20} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
                  {activeRide.vehicle_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? "Ride"}
                </Text>
                <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>
                  {activeRide.driver?.name ?? "Driver"} · {activeRide.eta_minutes ?? "—"} min away
                </Text>
              </View>
            </View>
            <View className="gap-1 mb-4">
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>
                Pickup: {activeRide.origin_address ?? "—"}
              </Text>
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>
                Destination: {activeRide.destination_address ?? "—"}
              </Text>
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>
                Fare: ৳{((Number(activeRide.fare_breakdown?.total_bdt ?? 0)) / 100).toFixed(0)}
              </Text>
            </View>
            <View className="gap-3">
              <TouchableOpacity
                className="rounded-full w-full py-[14px] items-center"
                style={{ backgroundColor: colors.primary }}
                onPress={() => router.push("/(main)/(customer)/driver-info")}
              >
                <Text className="text-[16px] font-JakartaBold" style={{ color: colors.white }}>Driver Info</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="rounded-full shadow-go-sm w-full py-[14px] items-center"
                style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
                onPress={() => router.push(`/(main)/(customer)/chat/${activeRide.id}`)}
              >
                <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>Chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="items-center py-8">
            <Text className="text-[20px] font-JakartaBold tracking-tight mb-4" style={{ color: textSecondary }}>
              No active rides
            </Text>
            <Text className="text-[16px] font-Jakarta text-center" style={{ color: textSecondary }}>
              Your active rides will appear here
            </Text>
          </View>
        )}
      </ScrollView>
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
