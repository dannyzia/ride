import { useState } from "react";
import { View, Text , Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";

import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import CustomButton from "@/components/CustomButton";

const DEVICE_ID_KEY = "@driver_device_id";

// Stable device identifier — push tokens rotate (reinstall, OS changes), so they
// must not be used as device_id or user_devices accumulates stale duplicate rows.
async function getDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = Crypto.randomUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch (err) {
    logger.warn("[push] failed to persist device id", err);
    return Crypto.randomUUID();
  }
}

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

    const device_id = await getDeviceId();

    await fetch(`${API_URL}/api/user/device`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ push_token: pushToken, platform, device_id }),
    });
  } catch (e) {
    logger.warn("[push] driver token registration failed", e);
  }
}

export default function DriverNotificationsPermission() {
  const [busy, setBusy] = useState(false);
  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const allow = async () => {
    setBusy(true);
    await registerPushToken();
    router.replace("/(main)/(rider)/onboarding");
  };

  const skip = () => router.replace("/(main)/(rider)/onboarding");

  return (
    <SafeAreaView className="flex-1 px-6" style={{ backgroundColor: bg }}>
      {/* Top spacer */}
      <View className="flex-1" />

      {/* Icon */}
      <View className="items-center mb-8">
        <View
          className="w-20 h-20 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.primary + "18" }}
        >
          <Ionicons name="notifications-outline" size={32} color={colors.primary} />
        </View>
      </View>

      {/* Title */}
      <Text
        className="text-[24px] font-JakartaBold text-center mb-3 px-4"
        style={{ color: textPrimary }}
      >
        Allow Notifications
      </Text>

      {/* Description */}
      <Text
        className="text-[16px] font-Jakarta text-center px-6"
        style={{ color: textSecondary }}
      >
        Ride requests, payouts, and promos delivered instantly. You can change this anytime in settings.
      </Text>

      {/* Bottom spacer */}
      <View className="flex-1" />

      {/* Buttons */}
      <View className="w-full pb-10 gap-3">
        <CustomButton
          title={busy ? "Enabling..." : "Allow"}
          onPress={allow}
          disabled={busy}
        />
        <CustomButton
          title="Not Now"
          bgVariant="secondary"
          onPress={skip}
        />
      </View>
    </SafeAreaView>
  );
}
