import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, Switch, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

interface Controls {
  share_usage_data: boolean;
  personalized_ads: boolean;
}

const DEFAULT_CONTROLS: Controls = {
  share_usage_data: true,
  personalized_ads: false,
};

export default function SettingsDataAnalytics() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;

  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/user/data-controls`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && !cancelled) {
          setControls({ ...DEFAULT_CONTROLS, ...data.data_controls });
        }
      } catch (err) {
        logger.error("DataAnalytics fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const updateControl = useCallback(async (key: keyof Controls, value: boolean) => {
    setControls((prev) => ({ ...prev, [key]: value }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch(`${API_URL}/api/user/data-controls`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: value }),
      });
    } catch (err) {
      logger.error("DataAnalytics PATCH failed", err);
    }
  }, []);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/settings")}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('settings.data_analytics')}</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="mt-4 mb-4">
          <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>{t('data_analytics.privacy_settings')}</Text>
          <View className="flex-row items-center justify-between px-[12px] py-[10px] border rounded-[8px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }}>
            <Text className="flex-1 text-[14px] font-Jakarta" style={{ color: textPrimary }}>{t('data_analytics.share_usage')}</Text>
            <Switch value={controls.share_usage_data} onValueChange={(v) => updateControl("share_usage_data", v)} trackColor={{ false: "#767577", true: "#0CC25F" }} thumbColor={controls.share_usage_data ? "#f5dd4b" : "#f4f3f4"} />
          </View>
          <View className="flex-row items-center justify-between px-[12px] py-[10px] border rounded-[8px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }}>
            <Text className="flex-1 text-[14px] font-Jakarta" style={{ color: textPrimary }}>{t('data_analytics.personalized_ads')}</Text>
            <Switch value={controls.personalized_ads} onValueChange={(v) => updateControl("personalized_ads", v)} trackColor={{ false: "#767577", true: "#0CC25F" }} thumbColor={controls.personalized_ads ? "#f5dd4b" : "#f4f3f4"} />
          </View>
        </View>
        <View className="mt-4">
          <TouchableOpacity className="w-full border rounded-[8px] px-[12px] py-[10px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }} onPress={() => router.push("/(main)/(customer)/(tabs)/settings/request-data")}>
            <Text className="text-[14px] font-Jakarta" style={{ color: textPrimary }}>{t('settings.request_data')}</Text>
          </TouchableOpacity>
          <TouchableOpacity className="w-full border rounded-[8px] px-[12px] py-[10px]" style={{ backgroundColor: surfaceBg, borderColor }} onPress={() => router.push("/(main)/(customer)/(tabs)/settings/delete-data")}>
            <Text className="text-[14px] font-Jakarta" style={{ color: colors.danger }}>{t('settings.delete_data')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
