import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { logger } from "@/lib/logger";

function daysBetween(fromIso: string, toIso: string): number {
  const diff = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function ActiveSubscription() {
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
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">My Subscription</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : !activeSubscription ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">No active subscription</Text>
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-6">
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
          <View className="p-[16px] bg-goAccentLight border border-goPrimary rounded-[12px] mb-4">
            <View className="flex-row justify-between items-center">
              <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{activeSubscription.package_name ?? "Active Plan"}</Text>
              <View className="bg-goPrimary rounded-full px-[10px] py-[4px]">
                <Text className="text-[12px] font-JakartaBold text-goWhite">{activeSubscription.status === "active" ? "Active" : activeSubscription.status}</Text>
              </View>
            </View>
            <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Activated: {formatDate(activeSubscription.purchased_at)}</Text>
            <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Expires: {formatDate(activeSubscription.expires_at)} · {daysLeft} days left</Text>
            {activeSubscription.is_trial ? (
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Trial plan</Text>
            ) : null}
          </View>
          <View className="p-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-4">
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Calls remaining</Text>
            <Text className="text-[28px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark">{activeSubscription.calls_remaining}</Text>
          </View>
          <TouchableOpacity
            className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-3"
            onPress={() => router.push("/(main)/(rider)/subscription-plans")}
          >
            <Text className="text-[18px] font-JakartaBold text-goWhite">Renew early</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center"
            onPress={() => router.push("/(main)/(rider)/subscription-plans")}
          >
            <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Change plan</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}