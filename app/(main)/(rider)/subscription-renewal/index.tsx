import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { logger } from "@/lib/logger";

function daysUntil(toIso: string): number {
  const diff = new Date(toIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function SubscriptionRenewal() {
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
      <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center">
        <ActivityIndicator size="large" color="#0CC25F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center mb-6">
        <Text className="text-[48px]">🔔</Text>
      </View>
      <Text className="text-[22px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Renew soon</Text>
      <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-3">
        {callsLeft} calls left · expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}
      </Text>
      <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-8">Renew now to avoid service interruption and loss of online status.</Text>
      <TouchableOpacity
        className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-3"
        onPress={() => router.push("/(main)/(rider)/subscription-plans")}
      >
        <Text className="text-[18px] font-JakartaBold text-goWhite">Renew now</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center"
        onPress={() => router.back()}
      >
        <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Remind later</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}