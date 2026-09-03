import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import ProgressBar from "@/components/ProgressBar";
import { useTranslation } from "react-i18next";

function daysBetween(fromIso: string, toIso: string): number {
  const diff = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function ActiveSubscription() {
  const { t } = useTranslation();  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const accentLight = isDark ? colors.primaryLightDark : colors.primaryLight;

  const { activeSubscription, fetchSubscription } = useDriverFlowStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetchSubscription();
      } catch (err) {
        logger.error("ActiveSubscription fetchSubscription failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchSubscription]);

  const formatDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const daysLeft = activeSubscription?.expires_at
    ? daysBetween(new Date().toISOString(), activeSubscription.expires_at)
    : 0;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>My Subscription</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : !activeSubscription ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[18px] font-JakartaBold mb-2" style={{ color: textPrimary }}>No active subscription</Text>
          <Text className="text-[14px] font-Jakarta text-center mb-6" style={{ color: textSecondary }}>
            Purchase a call package to start receiving ride requests.
          </Text>
          <TouchableOpacity
            className="bg-goPrimary rounded-full px-[24px] py-[14px]"
            onPress={() => router.push("/(main)/(rider)/subscription-plans")}
          >
            <Text className="text-[16px] font-JakartaBold text-goWhite">Browse Packages</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          <View className="p-[16px] border rounded-[12px] mb-4" style={{ backgroundColor: accentLight, borderColor: colors.primary }}>
            <View className="flex-row justify-between items-center">
              <Text className="text-[18px] font-JakartaBold flex-1" style={{ color: textPrimary }}>{activeSubscription.package_name ?? "Active Plan"}</Text>
              <View className="bg-goPrimary rounded-full px-[10px] py-[4px]">
                <Text className="text-[12px] font-JakartaBold text-goWhite">{activeSubscription.status === "active" ? "Active" : activeSubscription.status}</Text>
              </View>
            </View>
            <Text className="text-[14px] font-Jakarta mt-1" style={{ color: textSecondary }}>Activated: {formatDate(activeSubscription.purchased_at)}</Text>
            <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>Expires: {formatDate(activeSubscription.expires_at)} · {daysLeft} days left</Text>
            {activeSubscription.is_trial ? (
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>Trial plan</Text>
            ) : null}
          </View>
          <View className="p-[16px] border rounded-[12px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
            <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>Calls remaining</Text>
            <Text className="text-[28px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>{activeSubscription.calls_remaining === -1 ? "Unlimited" : activeSubscription.calls_remaining}</Text>
            {activeSubscription.calls_remaining !== -1 && (
              <ProgressBar
                current={activeSubscription.daily_calls_used ?? 0}
                total={Math.max(1, (activeSubscription.daily_calls_used ?? 0) + activeSubscription.calls_remaining)}
                label={`${activeSubscription.daily_calls_used ?? 0} used today`}
              />
            )}
          </View>
          <TouchableOpacity
            className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-3"
            onPress={() => router.push("/(main)/(rider)/subscription-plans")}
          >
            <Text className="text-[18px] font-JakartaBold text-goWhite">Renew early</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="border rounded-full w-full py-[16px] items-center"
            style={{ borderColor }}
            onPress={() => router.push("/(main)/(rider)/subscription-plans")}
          >
            <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Change plan</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
