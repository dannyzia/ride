import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, Switch, TouchableOpacity, ActivityIndicator } from "react-native";
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

export default function DriverSettingsNotifications() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/user/notification-prefs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && !cancelled) {
          setPrefs({ ...DEFAULT_PREFS, ...data.notification_prefs });
        }
      } catch (err) {
        logger.error("DriverNotifications fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updatePref = useCallback(async (key: keyof Prefs, value: boolean) => {
    const prior = prefs[key];
    setPrefs((p) => ({ ...p, [key]: value }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setPrefs((p) => ({ ...p, [key]: prior })); return; }
      const res = await fetch(`${API_URL}/api/user/notification-prefs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) setPrefs((p) => ({ ...p, [key]: prior }));
    } catch (err) {
      setPrefs((p) => ({ ...p, [key]: prior }));
      logger.error("DriverNotifications PATCH failed", err);
    }
  }, [prefs]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center">
        <ActivityIndicator size="large" color="#0CC25F" />
      </SafeAreaView>
    );
  }

  const rows: { label: string; key: keyof Prefs }[] = [
    { label: "Ride requests", key: "ride_updates" },
    { label: "Promos & offers", key: "promo_offers" },
    { label: "Service alerts", key: "service_alerts" },
    { label: "Email notifications", key: "email_notifications" },
    { label: "SMS notifications", key: "sms_notifications" },
  ];

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Notifications</Text>
        <View className="w-[50px]" />
      </View>
      <View className="flex-1 px-[24px] py-4">
        {rows.map((row) => (
          <View key={row.key} className="flex-row justify-between items-center p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3">
            <Text className="text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">{row.label}</Text>
            <Switch
              value={prefs[row.key]}
              onValueChange={(v) => updatePref(row.key, v)}
              trackColor={{ false: "#D1D5DB", true: "#0CC25F" }}
              thumbColor="#FFFFFF"
            />
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}