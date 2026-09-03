import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, Alert, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function SettingsRequestData() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState("");

  const handleRequest = async () => {
    setIsRequesting(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError(t('request_data.not_authenticated')); setIsRequesting(false); return; }
      const res = await fetch(API_URL + "/api/user/request-data", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      });
      if (res.ok) {
        Alert.alert(t('request_data.requested_title'), t('request_data.requested_message'));
        router.back();
      } else {
        const data = await res.json();
        setError(data.error || t('request_data.failed'));
      }
    } catch (err) {
      logger.error("Request data failed", err);
      setError(t('request_data.error_occurred'));
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('settings.request_data')}</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="items-center mt-6 mb-6">
          <View
            className="w-24 h-24 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: colors.primary + "1A" }}
          >
            <Ionicons name="download" size={40} color={colors.primary} />
          </View>
          <Text className="text-[24px] font-JakartaBold tracking-tight mb-2" style={{ color: textPrimary }}>{t('request_data.title')}</Text>
          <Text className="text-[16px] font-Jakarta text-center mb-4" style={{ color: textSecondary }}>
            {t('request_data.description')}
          </Text>
        </View>
        <View className="mb-6 p-[16px] border rounded-[12px]" style={{ backgroundColor: surfaceBg, borderColor }}>
          <Text className="text-[14px] font-JakartaBold mb-2" style={{ color: textPrimary }}>{t('request_data.what_you_receive')}</Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>{t('request_data.item_profile')}</Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>{t('request_data.item_rides')}</Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>{t('request_data.item_payments')}</Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>{t('request_data.item_addresses')}</Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>{t('request_data.item_devices')}</Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>{t('request_data.item_promos')}</Text>
        </View>
        <View className="mb-4 p-[16px] border rounded-[12px]" style={{ backgroundColor: colors.primary + "1A", borderColor: colors.blue + "4D" }}>
          <Text className="text-[14px] font-JakartaBold mb-2" style={{ color: colors.blue }}>{t('request_data.processing_time')}</Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>{t('request_data.processing_desc')}</Text>
        </View>
        {error ? <Text className="text-[14px] font-Jakarta mb-3 text-center" style={{ color: colors.danger }}>{error}</Text> : null}
        <TouchableOpacity
          className={'rounded-full w-full py-[16px] items-center ' + (isRequesting ? "opacity-40" : "")}
          style={{ backgroundColor: colors.primary }}
          onPress={handleRequest}
          disabled={isRequesting}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">{isRequesting ? t('request_data.requesting') : t('request_data.cta')}</Text>
        </TouchableOpacity>
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
