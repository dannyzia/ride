import { Text, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function RideCanceled() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <SafeAreaView className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
      <Ionicons name="close-circle" size={48} color={colors.danger} style={{ marginBottom: 16 }} />
      <Text className="text-[28px] font-JakartaBold tracking-tight mb-3" style={{ color: textPrimary }}>{t('canceled.ride_canceled')}</Text>
      <Text className="text-[16px] font-Jakarta text-center mb-12" style={{ color: textSecondary }}>
        {t('canceled.ride_canceled_subtitle')}
      </Text>
      <TouchableOpacity
        className="rounded-full w-full py-[16px] items-center"
        style={{ backgroundColor: colors.primary }}
        onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
      >
        <Text className="text-[18px] font-JakartaBold text-goWhite">{t('ride.back_to_home')}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
