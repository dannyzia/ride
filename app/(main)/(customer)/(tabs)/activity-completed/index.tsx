import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRiderStore } from "@/store/useRiderStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors, fonts } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function ActivityCompleted() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const { completedRides, fetchRideHistory } = useRiderStore();
  const [loading, setLoading] = useState(true);

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const border = isDark ? colors.borderDark : colors.borderLight;
  const bg = isDark ? colors.bgDark : colors.bgLight;

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
        logger.error("ActivityCompleted fetchRideHistory failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchRideHistory]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: border }}>
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}>
          <Text style={{ fontSize: 16, fontFamily: fonts.body, color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 18, fontFamily: fonts.heading, color: textPrimary }}>{t('activity.completed')}</Text>
        <View style={{ width: 50 }} />
      </View>
      <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} contentContainerStyle={{ paddingVertical: 24 }}>
        {(completedRides?.length ?? 0) > 0 ? (
          completedRides!.map((ride, index: number) => (
            <View key={index} style={{ backgroundColor: surface, borderWidth: 1, borderColor: border, borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentLight, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: fonts.heading, color: textPrimary }}>
                    {ride.vehicle_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? t('activity_completed.ride')}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: fonts.body, color: textSecondary }}>
                    {ride.date ?? ""} · {ride.time ?? ""}
                  </Text>
                </View>
              </View>
              <View style={{ gap: 4, marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.body, color: textSecondary }}>
                  {t('activity_completed.pickup', { address: ride.pickup_address ?? "—" })}
                </Text>
                <Text style={{ fontSize: 12, fontFamily: fonts.body, color: textSecondary }}>
                  {t('activity_completed.destination', { address: ride.destination_address ?? "—" })}
                </Text>
                <Text style={{ fontSize: 12, fontFamily: fonts.body, color: textSecondary }}>
                  {t('activity_completed.fare', { amount: ((ride.fare_bdt ?? 0) / 100).toFixed(0) })}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: surface, borderWidth: 1, borderColor: border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" }}
                  onPress={() => router.push(`/(main)/(customer)/ride-detail/${ride.id}`)}
                >
                  <Text style={{ fontSize: 14, fontFamily: fonts.heading, color: textPrimary }}>{t('activity_completed.view_receipt')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center" }}
                  onPress={() => router.push("/(main)/(customer)/rate-driver")}
                >
                  <Text style={{ fontSize: 14, fontFamily: fonts.heading, color: colors.white }}>{t('ride.rate_driver')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View style={{ alignItems: "center", paddingVertical: 32 }}>
            <Text style={{ fontSize: 20, fontFamily: fonts.heading, letterSpacing: -0.5, color: textSecondary, marginBottom: 16 }}>
              {t('activity_completed.no_rides')}
            </Text>
            <Text style={{ fontSize: 16, fontFamily: fonts.body, color: textSecondary, textAlign: "center" }}>
              {t('activity_completed.empty_desc')}
            </Text>
          </View>
        )}
      </ScrollView>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surface, borderWidth: 1, borderColor: border }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
