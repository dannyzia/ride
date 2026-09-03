import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, Image, TextInput, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useRiderStore } from "@/store/useRiderStore";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function SettingsPersonalInfo() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const disabledBg = isDark ? colors.borderDark : colors.borderLight;

  const { name, photo, setRider } = useRiderStore();
  const [localName, setLocalName] = useState(name || "");
  const [localPhoto, setLocalPhoto] = useState<string | null>(photo ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setLocalPhoto(result.assets[0].uri);
      }
    } catch (err) {
      logger.error("Image pick failed", err);
    }
  };

  const saveChanges = async () => {
    if (!localName.trim()) { setError(t('personal_info.name_required')); return; }
    setLoading(true); setError(""); setSuccessMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError(t('personal_info.not_authenticated')); return; }
      const res = await fetch(`${API_URL}/api/user/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: localName.trim(), profile_image_url: localPhoto }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('personal_info.save_failed')); return; }
      if (setRider) setRider({ name: localName.trim(), photo: localPhoto ?? undefined });
      setSuccessMessage(t('personal_info.updated'));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('personal_info.network_error'));
      logger.error("Profile save failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('settings.personal_info')}</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        <View className="items-center mb-6">
          <TouchableOpacity onPress={pickImage} className="mb-4">
            {localPhoto ? (
              <Image
                source={{ uri: localPhoto }}
                className="w-24 h-24 rounded-full"
                resizeMode="cover"
              />
            ) : (
              <View
                className="w-24 h-24 rounded-full items-center justify-center"
                style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}
              >
                <Text className="text-[14px] font-Jakarta" style={{ color: colors.primary }}>{t('personal_info.add_photo')}</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
            {localName || t('personal_info.add_name')}
          </Text>
        </View>
        <View className="mb-4">
          <Text className="text-[14px] font-Jakarta mb-2" style={{ color: textSecondary }}>{t('personal_info.name')}</Text>
          <TextInput
            className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta"
            style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
            placeholder={t('personal_info.name_placeholder')}
            placeholderTextColor={textSecondary}
            value={localName}
            onChangeText={setLocalName}
          />
        </View>
        <View className="mb-4">
          <Text className="text-[14px] font-Jakarta mb-2" style={{ color: textSecondary }}>{t('personal_info.email')}</Text>
          <TextInput
            className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta"
            style={{ backgroundColor: surfaceBg, borderColor, color: textSecondary }}
            placeholder={t('personal_info.not_set')}
            placeholderTextColor={textSecondary}
            editable={false}
          />
        </View>
        <View className="mb-6">
          <Text className="text-[14px] font-Jakarta mb-2" style={{ color: textSecondary }}>{t('personal_info.phone')}</Text>
          <TextInput
            className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta"
            style={{ backgroundColor: surfaceBg, borderColor, color: textSecondary }}
            placeholder={t('personal_info.not_set')}
            placeholderTextColor={textSecondary}
            editable={false}
          />
        </View>
        {error ? (
          <Text className="text-[14px] font-Jakarta mb-3 text-center" style={{ color: colors.danger }}>{error}</Text>
        ) : null}
        {successMessage ? (
          <Text className="text-[14px] font-Jakarta mb-3 text-center" style={{ color: colors.primary }}>{successMessage}</Text>
        ) : null}
        <TouchableOpacity
          className="rounded-full py-[16px] items-center"
          style={{ backgroundColor: loading ? disabledBg : colors.primary }}
          onPress={saveChanges}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">{t('personal_info.save_changes')}</Text>
          )}
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
