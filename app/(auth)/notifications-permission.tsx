import { View, Text, TouchableOpacity, Platform } from "react-native";
import { API_URL } from "@/lib/config";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

async function registerPushToken() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;
    const platform = Platform.OS === "ios" ? "ios" : "android";

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch(`${API_URL}/api/user/device`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ push_token: pushToken, platform, device_id: pushToken }),
    });
  } catch (e) {
    logger.warn("[push] token registration failed", e);
  }
}

export default function NotificationsPermission() {
  const [busy, setBusy] = useState(false);

  const allow = async () => {
    setBusy(true);
    await registerPushToken();
    router.replace("/(main)/(customer)/(tabs)/home");
  };

  const skip = () => router.replace("/(main)/(customer)/(tabs)/home");

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="flex-1 items-center justify-center">
        <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center mb-8">
          <Text className="text-[40px]">🔔</Text>
        </View>
        <Text className="text-[24px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-3">
          Allow Notifications
        </Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center">
          We&apos;ll send you ride updates, promo offers, and important alerts.
        </Text>
      </View>
      <View className="flex-row w-full pb-[40px]">
        <TouchableOpacity className="flex-1 border border-goBorderLight dark:border-goBorderDark rounded-full py-[16px] items-center mr-2" onPress={skip}>
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Not Now</Text>
        </TouchableOpacity>
        <TouchableOpacity className="flex-1 bg-goPrimary rounded-full py-[16px] items-center ml-2" onPress={allow} disabled={busy}>
          <Text className="text-[18px] font-JakartaBold text-goWhite">{busy ? "Enabling..." : "Allow"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
