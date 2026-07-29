import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Switch, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface Prefs {
  ride_updates: boolean;
  promo_offers: boolean;
  service_alerts: boolean;
  email_notifications: boolean;
  sms_notifications: boolean;
}

const DEFAULT_PREFS: Prefs = {
  ride_updates: true,
  promo_offers: true,
  service_alerts: true,
  email_notifications: false,
  sms_notifications: true,
};

export default function SettingsNotifications() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/user/notification-prefs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && !cancelled) {
          setPrefs({ ...DEFAULT_PREFS, ...data.notification_prefs });
        }
      } catch (err) {
        logger.error("SettingsNotifications fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updatePref = useCallback(async (key: keyof Prefs, value: boolean) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/user/notification-prefs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (err) {
      logger.error("SettingsNotifications PATCH failed", err);
    }
  }, []);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center">
        <ActivityIndicator size="large" color="#0CC25F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Notifications</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        <View className="mb-6">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-3">Alert Types</Text>
          <View className="gap-2">
            {([
              { label: "Ride Updates", key: "ride_updates" as const },
              { label: "Promo Offers", key: "promo_offers" as const },
              { label: "Service Alerts", key: "service_alerts" as const },
            ]).map((row) => (
              <View key={row.key} className="flex-row items-center justify-between px-[16px] py-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px]">
                <Text className="text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">{row.label}</Text>
                <Switch
                  value={prefs[row.key]}
                  onValueChange={(v) => updatePref(row.key, v)}
                  thumbColor={prefs[row.key] ? "#0CC25F" : "#9CA3AF"}
                  trackColor={{ false: "#D1D5DB", true: "#A7F3D0" }}
                />
              </View>
            ))}
          </View>
        </View>
        <View className="mb-6">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-3">Notification Channels</Text>
          <View className="gap-2">
            {([
              { label: "Email", key: "email_notifications" as const },
              { label: "SMS", key: "sms_notifications" as const },
            ]).map((row) => (
              <View key={row.key} className="flex-row items-center justify-between px-[16px] py-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px]">
                <Text className="text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">{row.label}</Text>
                <Switch
                  value={prefs[row.key]}
                  onValueChange={(v) => updatePref(row.key, v)}
                  thumbColor={prefs[row.key] ? "#0CC25F" : "#9CA3AF"}
                  trackColor={{ false: "#D1D5DB", true: "#A7F3D0" }}
                />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}