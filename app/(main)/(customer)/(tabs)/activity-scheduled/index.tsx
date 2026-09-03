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
import { useTranslation } from "react-i18next";

export default function ActivityScheduled() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const { scheduledRides, fetchRideHistory } = useRiderStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          await fetchRideHistory(token);
        }
      } catch (err) {
        logger.error("ActivityScheduled fetchRideHistory failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchRideHistory]);

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
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('activity_scheduled.title')}</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        {(scheduledRides?.length ?? 0) > 0 ? (
          scheduledRides!.map((ride, index: number) => (
            <View key={index} className="border rounded-[12px] p-[16px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}>
                  <Ionicons name="calendar" size={20} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>
                    {ride.vehicle_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? t('activity_scheduled.ride')}
                  </Text>
                  <Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>
                    {ride.date ?? ""} · {ride.time ?? ""}
                  </Text>
                </View>
              </View>
              <View className="gap-1 mb-3">
                <Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>
                  {t('activity_scheduled.pickup', { address: ride.pickup_address ?? "—" })}
                </Text>
                <Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>
                  {t('activity_scheduled.destination', { address: ride.destination_address ?? "—" })}
                </Text>
                <Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>
                  {t('activity_scheduled.fare', { amount: ((ride.fare_bdt ?? 0) / 100).toFixed(0) })}
                </Text>
              </View>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="flex-1 border rounded-[8px] px-[12px] py-[8px] items-center"
                  style={{ backgroundColor: surfaceBg, borderColor }}
                  onPress={() => router.push(`/(main)/(customer)/ride-details-scheduled/${ride.id}`)}
                >
                  <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{t('activity_scheduled.view_details')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 rounded-[8px] px-[12px] py-[8px] items-center"
                  style={{ backgroundColor: colors.danger }}
                  onPress={() => router.replace("/(main)/(customer)/cancel-reason")}
                >
                  <Text className="text-[14px] font-JakartaBold" style={{ color: colors.white }}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View className="items-center py-8">
            <Text className="text-[20px] font-JakartaBold tracking-tight mb-4" style={{ color: textSecondary }}>
              {t('activity_scheduled.no_rides')}
            </Text>
            <Text className="text-[16px] font-Jakarta text-center" style={{ color: textSecondary }}>
              {t('activity_scheduled.empty_desc')}
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
