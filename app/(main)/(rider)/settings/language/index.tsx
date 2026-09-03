import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { setLanguage as persistLanguage } from "@/i18n/i18n";

interface LanguageOption {
  code: string;
  name: string;
  native: string;
}

const langs: LanguageOption[] = [
  { code: "en", name: "English", native: "English" },
  { code: "bn", name: "Bangla", native: "বাংলা" },
];

export default function DriverSettingsLanguage() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const accentLight = isDark ? colors.primaryLightDark : colors.primaryLight;

  const { i18n } = useTranslation();
  const [selected, setSelected] = useState(i18n.language || "en");

  const selectLang = (code: string) => {
    setSelected(code);
    persistLanguage(code as 'en' | 'bn');
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Language</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {langs.map((l) => (
          <TouchableOpacity
            key={l.code}
            className="flex-row items-center p-[14px] mb-3 rounded-[12px] border"
            style={selected === l.code
              ? { borderColor: colors.primary, backgroundColor: accentLight }
              : { borderColor, backgroundColor: surfaceBg }}
            onPress={() => selectLang(l.code)}
          >
            <View
              className="w-5 h-5 rounded-full border-2 mr-[12px]"
              style={selected === l.code ? { borderColor: colors.primary, backgroundColor: colors.primary } : { borderColor }}
            />
            <View className="flex-1">
              <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{l.name}</Text>
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>{l.native}</Text>
            </View>
          </TouchableOpacity>
        ))}
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
