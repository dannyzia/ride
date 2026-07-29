import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAppearance } from "@/lib/useAppearance";

export default function SettingsAppAppearance() {
  const { theme, setTheme } = useAppearance();

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/settings")}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">App Appearance</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="mt-4 mb-4">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Theme</Text>
          {(["light", "dark", "system"] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              className={`flex-row items-center justify-between p-[12px] mb-2 bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border rounded-[8px] ${
                theme === mode ? "border-goPrimary bg-goAccentLight dark:bg-goAccentLight" : "border-goBorderLight dark:border-goBorderDark"
              }`}
              onPress={() => setTheme(mode)}
            >
              <View className="flex-row items-center">
                <View className={`w-8 h-8 rounded-full mr-3 items-center justify-center ${mode === "dark" ? "bg-goBgDark" : mode === "system" ? "bg-goAccent" : "bg-goPrimary"}`}>
                  <Text className="text-[16px]">{mode === "light" ? "☀️" : mode === "dark" ? "🌙" : "📱"}</Text>
                </View>
                <View>
                  <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                  <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                    {mode === "light" ? "Always use light mode" : mode === "dark" ? "Always use dark mode" : "Follow device settings"}
                  </Text>
                </View>
              </View>
              {theme === mode && <View className="w-5 h-5 rounded-full border-2 border-goPrimary items-center justify-center"><Text className="text-[10px] font-JakartaBold text-goPrimary">✓</Text></View>}
            </TouchableOpacity>
          ))}
        </View>
        <View className="mt-6">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Language</Text>
          <TouchableOpacity
            className="flex-row items-center justify-between p-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px]"
            onPress={() => router.push("/(main)/(customer)/(tabs)/settings/app-language")}
          >
            <View className="flex-row items-center">
              <View className="w-8 h-8 rounded-full bg-goAccent mr-3 items-center justify-center"><Text className="text-[16px]">🌐</Text></View>
              <View>
                <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">App Language</Text>
                <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">English (Default)</Text>
              </View>
            </View>
            <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
