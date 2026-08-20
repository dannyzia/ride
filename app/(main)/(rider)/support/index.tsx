import { View, Text, TouchableOpacity, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function DriverSupport() {
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
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Support</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <TouchableOpacity
          className="p-[14px] border rounded-[12px] mb-3"
          style={{ backgroundColor: surfaceBg, borderColor }}
          onPress={() => router.push("/(main)/(rider)/faq")}
        >
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>FAQ</Text>
              <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>Frequently asked questions</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={textSecondary} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          className="p-[14px] border rounded-[12px] mb-3"
          style={{ backgroundColor: surfaceBg, borderColor }}
          onPress={() => router.push("/(main)/(rider)/contact-support")}
        >
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>Contact support</Text>
              <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>Chat with our team</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={textSecondary} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          className="p-[14px] border rounded-[12px] mb-3"
          style={{ backgroundColor: surfaceBg, borderColor }}
          onPress={() => router.push("/(main)/(rider)/report-issue")}
        >
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>Report an issue</Text>
              <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>Report a bug or problem</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={textSecondary} />
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
