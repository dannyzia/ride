import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAppearance } from "@/lib/useAppearance";

const THEMES = ["light", "dark", "system"] as const;
const THEME_LABELS: Record<string, string> = { light: "Light", dark: "Dark", system: "System" };

export default function DriverSettingsAppearance() {
  const { theme, setTheme } = useAppearance();

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Appearance</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {THEMES.map((t) => (
          <TouchableOpacity
            key={t}
            className={`flex-row items-center p-[14px] mb-3 rounded-[12px] border ${
              theme === t
                ? "border-goPrimary bg-goAccentLight"
                : "border-goBorderLight dark:border-goBorderDark bg-goSurfaceLight dark:bg-goSurfaceElevatedDark"
            }`}
            onPress={() => setTheme(t)}
          >
            <View className={`w-5 h-5 rounded-full border-2 mr-[12px] ${theme === t ? "border-goPrimary bg-goPrimary" : "border-goBorderLight dark:border-goBorderDark"}`} />
            <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{THEME_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          className="mt-4 p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]"
          onPress={() => router.push("/(main)/(rider)/settings/language")}
        >
          <View className="flex-row justify-between items-center">
            <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Language</Text>
            <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">English ›</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
