import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

function daysUntil(toIso: string): number {
  const diff = new Date(toIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function SubscriptionRenewal() {
  const isDark = useIsDark();
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
        logger.error("SubscriptionRenewal fetchSubscription failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchSubscription]);

  const callsLeft = activeSubscription?.calls_remaining ?? 0;
  const daysLeft = activeSubscription?.expires_at ? daysUntil(activeSubscription.expires_at) : 0;

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color="#0CC25F" />
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

  return (
    <SafeAreaView className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="w-24 h-24 rounded-full items-center justify-center mb-6" style={{ backgroundColor: accentLight }}>
        <Ionicons name="notifications-outline" size={48} color={colors.primary} />
      </View>
      <Text className="text-[22px] font-JakartaBold tracking-tight mb-2" style={{ color: textPrimary }}>Renew soon</Text>
      <Text className="text-[15px] font-Jakarta text-center mb-3" style={{ color: textSecondary }}>
        {callsLeft} calls left · expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}
      </Text>
      <Text className="text-[13px] font-Jakarta text-center mb-8" style={{ color: textSecondary }}>Renew now to avoid service interruption and loss of online status.</Text>
      <TouchableOpacity
        className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-3"
        onPress={() => router.push("/(main)/(rider)/subscription-plans")}
      >
        <Text className="text-[18px] font-JakartaBold text-goWhite">Renew now</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="border rounded-full w-full py-[16px] items-center"
        style={{ borderColor }}
        onPress={() => router.back()}
      >
        <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Remind later</Text>
      </TouchableOpacity>
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
