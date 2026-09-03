import { View, Text, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { authCleanup } from "@/lib/authCleanup";
import { useTranslation } from "react-i18next";

export default function SettingsLogoutConfirmation() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      // doc 03 R2.5 #4 (binding): no manual router.replace — the auth gate
      // handles the redirect after the session drops.
      authCleanup();
    } catch (err) {
      logger.error("Logout failed", err);
    }
  };

  return (
    <SafeAreaView className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="items-center mb-8">
        <View
          className="w-24 h-24 rounded-full items-center justify-center mb-4"
          style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        >
          <Ionicons name="log-out-outline" size={40} color={colors.danger} />
        </View>
        <Text className="text-[24px] font-JakartaBold tracking-tight mb-2" style={{ color: textPrimary }}>
          {t('logout_confirmation.title')}
        </Text>
        <Text className="text-[16px] font-Jakarta text-center" style={{ color: textSecondary }}>
          {t('logout_confirmation.message')}
        </Text>
      </View>
      <View className="w-full gap-4">
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center"
          style={{ backgroundColor: colors.danger }}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel={t('logout_confirmation.log_out_a11y')}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">{t('logout_confirmation.title')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center"
          style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        >
          <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>
            {t('common.cancel')}
          </Text>
        </TouchableOpacity>
      </View>
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
