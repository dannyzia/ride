import { View, Text, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

// C3-2 (STAGE C3-FIX, ruled): referrals DORMANT — "coming soon" copy per the
// F-26 pattern (cf. linked_accounts.add_account_dormant: a disabled action).
// The write-less pipeline stays schema-only (P5, post-launch): no fetch, no
// share, no code issuance from this surface.
export default function DriverReferral() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()} className="mr-[12px] p-[4px]" testID="rider.referral.el-1">
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('referral.title')}</Text>
        <View style={{ width: 32 }} />
      </View>
      <View className="flex-1 items-center justify-center px-[24px]">
        <View className="w-24 h-24 rounded-full items-center justify-center mb-6" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}>
          <Ionicons name="people" size={48} color={colors.primary} />
        </View>
        <Text className="text-[22px] font-JakartaBold tracking-tight mb-2 text-center" style={{ color: textPrimary }}>{t('referral.title')}</Text>
        <Text className="text-[15px] font-Jakarta text-center mb-6" style={{ color: textSecondary }}>
          {t('referral.coming_soon')}
        </Text>
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center border"
          style={{ backgroundColor: surfaceBg, borderColor }}
          disabled
         testID="rider.referral.el-2">
          <Text className="text-[16px] font-JakartaBold" style={{ color: textSecondary }}>
            {t('referral.coming_soon')}
          </Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
       testID="rider.referral.set-theme">
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
