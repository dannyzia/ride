import { View, Text, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function TopUpSuccess() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const { amount } = useLocalSearchParams<{ amount: string }>();

  return (
    <SafeAreaView className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View
        className="w-24 h-24 rounded-full items-center justify-center mb-6"
        style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}
      >
        <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
      </View>
      <Text className="text-[24px] font-JakartaBold tracking-tight mb-2" style={{ color: textPrimary }}>
        {t('top_up_success.title')}
      </Text>
      <Text className="text-[15px] font-Jakarta text-center mb-2" style={{ color: textSecondary }}>
        {t('top_up_success.added', { amount: amount ?? "500" })}
      </Text>
      <Text className="text-[13px] font-Jakarta text-center mb-8" style={{ color: textSecondary }}>
        {t('top_up_success.usable')}
      </Text>
      <TouchableOpacity
        className="rounded-full w-full py-[16px] items-center mb-3"
        style={{ backgroundColor: colors.primary }}
        onPress={() => router.replace("/(main)/(customer)/(tabs)/rides")}
      >
        <Text className="text-[18px] font-JakartaBold text-goWhite">{t('top_up_success.view_transactions')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="border rounded-full w-full py-[16px] items-center"
        style={{ borderColor }}
        onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
      >
        <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('ride.back_to_home')}</Text>
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
