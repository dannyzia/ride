import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, Switch, TouchableOpacity, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;

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

  const rows: { label: string; key: keyof Prefs }[] = [
    { label: "Ride requests", key: "ride_updates" },
    { label: "Promos & offers", key: "promo_offers" },
    { label: "Service alerts", key: "service_alerts" },
    { label: "Email notifications", key: "email_notifications" },
    { label: "SMS notifications", key: "sms_notifications" },
  ];

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Notifications</Text>
        <View className="w-[50px]" />
      </View>
      <View className="flex-1 px-[24px] py-4">
        {rows.map((row) => (
          <View key={row.key} className="flex-row justify-between items-center p-[14px] border rounded-[12px] mb-3" style={{ backgroundColor: surfaceBg, borderColor }}>
            <Text className="text-[15px] font-Jakarta flex-1" style={{ color: textPrimary }}>{row.label}</Text>
            <Switch
              value={prefs[row.key]}
              onValueChange={(v) => updatePref(row.key, v)}
              trackColor={{ false: "#D1D5DB", true: "#0CC25F" }}
              thumbColor="#FFFFFF"
            />
          </View>
        ))}
      </View>
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
