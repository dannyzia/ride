import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

const LABELS = ["Home", "Work", "Gym", "Friend", "Other"];

const LABEL_KEYS: Record<string, string> = {
  Home: "saved_addresses.label_home",
  Work: "saved_addresses.label_work",
  Gym: "saved_addresses.label_gym",
  Friend: "saved_addresses.label_friend",
  Other: "saved_addresses.label_other",
};

export default function AddAddress() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const disabledBg = isDark ? colors.borderDark : colors.borderLight;

  const [label, setLabel] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const effectiveLabel = label === "Other" ? customLabel : label;

  const handleSave = async () => {
    if (!effectiveLabel.trim()) { setError(t('saved_addresses.error_label')); return; }
    if (!addressLine.trim()) { setError(t('saved_addresses.error_address')); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError(t('wallet.not_authenticated')); return; }
      const res = await fetch(`${API_URL}/api/rider/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: effectiveLabel.trim(), address: addressLine.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('saved_addresses.save_failed')); return; }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('wallet.network_error'));
      logger.error("Add address failed", err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <View
          className="w-20 h-20 rounded-full items-center justify-center mb-4"
          style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}
        >
          <Ionicons name="checkmark-circle" size={36} color={colors.primary} />
        </View>
        <Text className="text-[22px] font-JakartaBold tracking-tight mb-2" style={{ color: textPrimary }}>
          {t('saved_addresses.added_title')}
        </Text>
        <Text className="text-[15px] font-Jakarta text-center mb-2" style={{ color: textSecondary }}>
          {LABEL_KEYS[effectiveLabel] ? t(LABEL_KEYS[effectiveLabel]) : effectiveLabel} — {addressLine}
        </Text>
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center mb-3"
          style={{ backgroundColor: colors.primary }}
          onPress={() => router.replace("/(main)/(customer)/(tabs)/settings/saved-addresses")}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">{t('saved_addresses.done')}</Text>
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

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('saved_addresses.add')}</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        <Text className="text-[15px] font-JakartaBold mb-3" style={{ color: textPrimary }}>
          {t('saved_addresses.select_label')}
        </Text>
        <ScrollView horizontal className="mb-6">
          {LABELS.map((l) => (
            <TouchableOpacity
              key={l}
              className="px-[20px] py-[10px] rounded-full border mr-3"
              style={label === l
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: surfaceBg, borderColor }}
              onPress={() => { setLabel(l); setCustomLabel(""); }}
            >
              <Text
                className="text-[14px] font-JakartaBold"
                style={{ color: label === l ? colors.white : textPrimary }}
              >
                {LABEL_KEYS[l] ? t(LABEL_KEYS[l]) : l}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {label === "Other" && (
          <View className="mb-6">
            <Text className="text-[15px] font-JakartaBold mb-2" style={{ color: textPrimary }}>
              {t('saved_addresses.custom_label')}
            </Text>
            <TextInput
              className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta"
              style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
              placeholder={t('saved_addresses.placeholder_label')}
              placeholderTextColor={textSecondary}
              value={customLabel}
              onChangeText={setCustomLabel}
            />
          </View>
        )}
        <View className="mb-6">
          <Text className="text-[15px] font-JakartaBold mb-2" style={{ color: textPrimary }}>
            {t('saved_addresses.address')}
          </Text>
          <TextInput
            className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta"
            style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
            placeholder={t('saved_addresses.placeholder_address')}
            placeholderTextColor={textSecondary}
            value={addressLine}
            onChangeText={setAddressLine}
          />
        </View>
        {error ? <Text className="text-[14px] font-Jakarta mb-3" style={{ color: colors.danger }}>{error}</Text> : null}
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center mt-4"
          style={{ backgroundColor: loading ? disabledBg : colors.primary }}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator size={20} color="#FFFFFF" /> : <Text className="text-[18px] font-JakartaBold text-goWhite">{t('saved_addresses.save')}</Text>}
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
