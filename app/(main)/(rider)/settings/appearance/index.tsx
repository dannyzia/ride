import { View, Text, TouchableOpacity, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

const THEMES = ["light", "dark", "system"] as const;
const THEME_LABELS: Record<string, string> = { light: "Light", dark: "Dark", system: "System" };

export default function DriverSettingsAppearance() {
  const { t } = useTranslation();  const isDark = useIsDark();
  const { theme, setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const accentLight = isDark ? colors.primaryLightDark : colors.primaryLight;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Appearance</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {THEMES.map((t) => (
          <TouchableOpacity
            key={t}
            className="flex-row items-center p-[14px] mb-3 rounded-[12px] border"
            style={theme === t
              ? { borderColor: colors.primary, backgroundColor: accentLight }
              : { borderColor, backgroundColor: surfaceBg }}
            onPress={() => setTheme(t)}
          >
            <View
              className="w-5 h-5 rounded-full border-2 mr-[12px]"
              style={theme === t ? { borderColor: colors.primary, backgroundColor: colors.primary } : { borderColor }}
            />
            <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{THEME_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          className="mt-4 p-[14px] border rounded-[12px]"
          style={{ backgroundColor: surfaceBg, borderColor }}
          onPress={() => router.push("/(main)/(rider)/settings/language")}
        >
          <View className="flex-row justify-between items-center">
            <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>Language</Text>
            <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>English ›</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
