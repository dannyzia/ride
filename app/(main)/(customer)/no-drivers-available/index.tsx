import { View, Text, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function NoDriversAvailable() {
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
      <View className="items-center mb-8">
        <View
          className="w-24 h-24 rounded-full items-center justify-center mb-4"
          style={{ backgroundColor: isDark ? "rgba(227, 29, 28, 0.15)" : colors.dangerLight }}
        >
          <Ionicons name="ban" size={40} color={colors.danger} />
        </View>
        <Text className="text-[24px] font-JakartaBold tracking-tight mb-2" style={{ color: textPrimary }}>{t('no_drivers_available.title')}</Text>
        <Text className="text-[16px] font-Jakarta text-center mb-6" style={{ color: textSecondary }}>
          {t('no_drivers_available.message')}
        </Text>
      </View>
      <View className="w-full gap-3">
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center"
          style={{ backgroundColor: colors.primary }}
          onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">{t('no_drivers_available.try_again')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="border rounded-full w-full py-[16px] items-center"
          style={{ borderColor }}
          onPress={() => router.push("/(main)/(customer)/schedule-ride")}
        >
          <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('no_drivers_available.schedule_for_later')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
