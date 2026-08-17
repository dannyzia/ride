import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

export default function EarningScreen() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;

  const menu = [
    { label: "Earnings Overview", route: "/(main)/(rider)/earnings" },
    { label: "Earnings Breakdown", route: "/(main)/(rider)/earnings-breakdown" },
    { label: "Commission Statement", route: "/(main)/(rider)/commission-statement" },
    { label: "Performance Stats", route: "/(main)/(rider)/performance-stats" },
  ] as const;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <View className="px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>Earnings</Text>
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        {menu.map((item) => (
          <TouchableOpacity
            key={item.route}
            className="p-[14px] border rounded-[12px]"
            style={{ backgroundColor: surfaceBg, borderColor }}
            onPress={() => router.push(item.route)}
          >
            <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
