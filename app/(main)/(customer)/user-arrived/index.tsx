import { View, Text, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRiderStore } from "@/store/useRiderStore";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function UserArrived() {
  const { t } = useTranslation();
  const { activeRide } = useRiderStore();
  const driverName = activeRide?.driver?.name ?? t('user_arrived.your_driver');
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
      <View
        className="w-24 h-24 rounded-full items-center justify-center mb-6"
        style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}
      >
        <Ionicons name="location" size={48} color={colors.primary} />
      </View>
      <Text className="text-[24px] font-JakartaBold tracking-tight mb-2" style={{ color: textPrimary }}>
        {t('user_arrived.title')}
      </Text>
      <Text className="text-[15px] font-Jakarta text-center mb-8" style={{ color: textSecondary }}>
        {t('user_arrived.subtitle', { name: driverName })}
      </Text>
      <TouchableOpacity
        className="rounded-full w-full py-[16px] items-center mb-3"
        style={{ backgroundColor: colors.primary }}
        onPress={() => router.replace("/(main)/(customer)/rate-driver")}
      >
        <Text className="text-[18px] font-JakartaBold text-goWhite">{t('user_arrived.rate_your_driver')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="border rounded-full w-full py-[16px] items-center"
        style={{ borderColor }}
        onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
      >
        <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('user_arrived.skip')}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
